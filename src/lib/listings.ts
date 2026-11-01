import { haversineKm, lookupAirport, type AirportInfo } from "./airportTable";

/** A publicly listed empty leg (Limitless Sky public RSS, refreshed ~15 min). */
export interface LiveLeg {
  id: string;
  origin: AirportInfo;
  destination: AirportInfo;
  /** ISO dates (YYYY-MM-DD) for the departure window */
  departFrom: string;
  departTo: string;
  aircraft: string;
  category: string;
  operator: string | null;
  priceText: string;
  priceValue: number | null;
  currency: string | null;
  seats: number | null;
  perSeat: number | null;
  distanceKm: number;
  flightMinutes: number;
  /** Booking / quote page on the listing site */
  bookUrl: string;
  publishedAt: string | null;
}

const FEED = "https://thelimitlesssky.com/api/public/empty-legs/rss.xml";
const TTL_MS = 15 * 60_000;
/** Feed caps at 200 per call; stagger windows to widen coverage. */
const WINDOW_OFFSETS_DAYS = [0, 5, 12, 25];

let cache: { at: number; legs: LiveLeg[] } | null = null;
let inflight: Promise<LiveLeg[]> | null = null;

const CRUISE_KT: Record<string, number> = {
  turboprop: 280,
  "very light": 380,
  light: 420,
  midsize: 440,
  "super midsize": 460,
  heavy: 470,
  "ultra long range": 480,
  airliner: 450,
  vip: 450,
};

export function estimateFlightMinutes(distanceKm: number, category: string) {
  const kt = CRUISE_KT[category.toLowerCase()] ?? 430;
  const nm = distanceKm / 1.852;
  return Math.round((nm / kt) * 60 + 25);
}

const NA = new Set(["US", "CA", "MX", "BS"]);

// The feed labels US airports by FAA identifier, which collides with foreign IATA
// codes (IWA = Mesa Gateway, not Ivanovo). If the other end of the leg is in North
// America and the bare code resolved abroad, prefer the K-prefixed US airport.
function preferDomestic(a: AirportInfo | null, code: string, other: AirportInfo | null) {
  if (!a || !other || code.length !== 3) return a;
  if (NA.has(a.country) || !NA.has(other.country)) return a;
  const us = lookupAirport(`K${code}`);
  return us && us.country === "US" ? us : a;
}

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]).trim() : null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseHumanDate(s: string): string | null {
  const m = s.match(/([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function parsePrice(text: string): { value: number | null; currency: string | null } {
  const m = text.match(/([$€£])\s?([\d,]+)/);
  if (!m) return { value: null, currency: null };
  const currency = m[1] === "$" ? "USD" : m[1] === "€" ? "EUR" : "GBP";
  return { value: Number(m[2].replace(/,/g, "")), currency };
}

export function parseFeed(xml: string): LiveLeg[] {
  const out: LiveLeg[] = [];
  const items = xml.split("<item>").slice(1);
  for (const raw of items) {
    const block = raw.split("</item>")[0];
    const link = tag(block, "link") ?? "";
    const guid = tag(block, "guid") ?? link;
    const title = tag(block, "title") ?? "";
    const desc = tag(block, "description") ?? "";
    const cats = [...block.matchAll(/<category>([^<]*)<\/category>/g)].map((m) =>
      decode(m[1]).trim(),
    );
    const url = new URL(link, FEED);
    const qs = url.searchParams;
    const originCode = qs.get("from") ?? title.match(/\(([A-Z0-9]{3,4})\)/)?.[1];
    const destCode =
      qs.get("to") ?? title.match(/→\s*.+?\(([A-Z0-9]{3,4})\)/)?.[1];
    let origin = lookupAirport(originCode);
    let destination = lookupAirport(destCode);
    origin = preferDomestic(origin, originCode ?? "", destination);
    destination = preferDomestic(destination, destCode ?? "", origin);
    if (!origin || !destination || origin.code === destination.code) continue;

    const windowMatch = desc.match(/Departure window:\s*([^–.]+?)(?:\s*–\s*([^.]+?))?\.(?:\s|$)/);
    const departFrom =
      (windowMatch && parseHumanDate(windowMatch[1])) ?? qs.get("date") ?? "";
    const departTo =
      (windowMatch && windowMatch[2] && parseHumanDate(windowMatch[2])) ?? departFrom;
    const operator = desc.match(/Operated by ([^.]+?)\.\s/)?.[1] ?? null;
    const priceText = title.split("·").pop()?.trim() || "On request";
    const { value, currency } = parsePrice(priceText);
    const seats = Number(desc.match(/(\d+)\s+seats/)?.[1]) || null;
    const perSeatMatch = desc.match(/≈\s*[$€£]\s?([\d,]+)\s+per passenger/);
    const perSeat = perSeatMatch ? Number(perSeatMatch[1].replace(/,/g, "")) : null;
    const aircraft =
      (qs.get("aircraft") ?? cats[0] ?? "").replace(/\+/g, " ").trim() || "Private jet";
    const category = cats[1] ?? desc.match(/Category:\s*([^.]+)\./)?.[1] ?? "Jet";
    const distanceKm = Math.round(
      haversineKm(origin.lat, origin.lon, destination.lat, destination.lon),
    );
    if (distanceKm < 30) continue;

    out.push({
      id: guid,
      origin,
      destination,
      departFrom,
      departTo,
      aircraft,
      category,
      operator,
      priceText,
      priceValue: value,
      currency,
      seats,
      perSeat,
      distanceKm,
      flightMinutes: estimateFlightMinutes(distanceKm, category),
      bookUrl: link,
      publishedAt: tag(block, "pubDate"),
    });
  }
  return out;
}

async function fetchWindow(fromDate: string): Promise<string> {
  const u = `${FEED}?max=200&fromDate=${fromDate}`;
  const res = await fetch(u, {
    headers: { "User-Agent": "aviata/0.3 (empty-leg globe)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`feed ${res.status}`);
  return res.text();
}

function isoPlusDays(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getLiveLegs(force = false): Promise<LiveLeg[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.legs;
  if (inflight) return inflight;
  inflight = (async () => {
    const results = await Promise.allSettled(
      WINDOW_OFFSETS_DAYS.map((d) => fetchWindow(isoPlusDays(d))),
    );
    const seen = new Set<string>();
    const legs: LiveLeg[] = [];
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const leg of parseFeed(r.value)) {
        if (seen.has(leg.id)) continue;
        seen.add(leg.id);
        legs.push(leg);
      }
    }
    if (legs.length === 0 && cache) return cache.legs;
    legs.sort((a, b) => a.departFrom.localeCompare(b.departFrom));
    cache = { at: Date.now(), legs };
    return legs;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
