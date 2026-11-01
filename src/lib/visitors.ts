import { nearestAirport, type AirportInfo } from "./airportTable";

export interface VisitorGeo {
  lat: number;
  lon: number;
  city: string | null;
  region: string | null;
  country: string | null;
  source: "edge-headers" | "ipinfo" | "none";
}

export type VisitorEvent =
  | { type: "search"; q: string; lat: number; lon: number; label: string; at: string }
  | { type: "pin"; lat: number; lon: number; label: string | null; at: string }
  | { type: "view"; legId: string; origin: string; destination: string; at: string }
  | { type: "book"; legId: string; url: string; at: string };

export interface Visitor {
  id: string;
  ip: string | null;
  geo: VisitorGeo | null;
  home: AirportInfo | null;
  firstSeen: string;
  lastSeen: string;
  visits: number;
  events: VisitorEvent[];
}

export const VISITOR_COOKIE = "rp_vid";
const MAX_EVENTS = 200;

const visitors = new Map<string, Visitor>();
const geoByIp = new Map<string, { at: number; geo: VisitorGeo | null }>();
const GEO_TTL = 6 * 3600_000;

export function newVisitorId() {
  return `v_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function clientIp(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  const ip = (fwd?.split(",")[0] ?? headers.get("x-real-ip") ?? "").trim();
  return ip || null;
}

function isPrivate(ip: string) {
  return (
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("::ffff:127.")
  );
}

function fromEdgeHeaders(h: Headers): VisitorGeo | null {
  const lat = Number(h.get("x-vercel-ip-latitude") ?? h.get("cf-iplatitude"));
  const lon = Number(h.get("x-vercel-ip-longitude") ?? h.get("cf-iplongitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return {
    lat,
    lon,
    city: h.get("x-vercel-ip-city") ? decodeURIComponent(h.get("x-vercel-ip-city")!) : null,
    region: h.get("x-vercel-ip-country-region"),
    country: h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry"),
    source: "edge-headers",
  };
}

async function fromIpinfo(ip: string | null): Promise<VisitorGeo | null> {
  const key = ip && !isPrivate(ip) ? ip : "self";
  const cached = geoByIp.get(key);
  if (cached && Date.now() - cached.at < GEO_TTL) return cached.geo;
  let geo: VisitorGeo | null = null;
  try {
    const token = process.env.IPINFO_TOKEN;
    const url =
      key === "self"
        ? `https://ipinfo.io/json${token ? `?token=${token}` : ""}`
        : `https://ipinfo.io/${key}/json${token ? `?token=${token}` : ""}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const j = (await res.json()) as { loc?: string; city?: string; region?: string; country?: string };
      const [lat, lon] = (j.loc ?? "").split(",").map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        geo = {
          lat,
          lon,
          city: j.city ?? null,
          region: j.region ?? null,
          country: j.country ?? null,
          source: "ipinfo",
        };
      }
    }
  } catch {
    geo = null;
  }
  geoByIp.set(key, { at: Date.now(), geo });
  return geo;
}

export async function geolocate(headers: Headers): Promise<VisitorGeo | null> {
  return fromEdgeHeaders(headers) ?? (await fromIpinfo(clientIp(headers)));
}

export async function touchVisitor(id: string, headers: Headers): Promise<Visitor> {
  const now = new Date().toISOString();
  let v = visitors.get(id);
  if (!v) {
    v = {
      id,
      ip: clientIp(headers),
      geo: null,
      home: null,
      firstSeen: now,
      lastSeen: now,
      visits: 0,
      events: [],
    };
    visitors.set(id, v);
  }
  v.visits += 1;
  v.lastSeen = now;
  v.ip = clientIp(headers) ?? v.ip;
  if (!v.geo) {
    v.geo = await geolocate(headers);
    if (v.geo) v.home = nearestAirport(v.geo.lat, v.geo.lon, 1);
  }
  return v;
}

export function recordEvent(id: string, ev: VisitorEvent) {
  const v = visitors.get(id);
  if (!v) return;
  v.events.push(ev);
  if (v.events.length > MAX_EVENTS) v.events.splice(0, v.events.length - MAX_EVENTS);
  v.lastSeen = ev.at;
}

export function getVisitor(id: string) {
  return visitors.get(id) ?? null;
}

/** Airports the visitor has shown interest in (searched/pinned/viewed), most recent first. */
export function interestPoints(v: Visitor): Array<{ lat: number; lon: number; label: string; weight: number }> {
  const pts: Array<{ lat: number; lon: number; label: string; weight: number }> = [];
  const recent = v.events.slice(-40).reverse();
  recent.forEach((e, i) => {
    const w = 1 - i / 50;
    if (e.type === "search" || e.type === "pin") {
      pts.push({ lat: e.lat, lon: e.lon, label: e.label ?? "pin", weight: w });
    }
  });
  if (v.geo) pts.push({ lat: v.geo.lat, lon: v.geo.lon, label: v.geo.city ?? "you", weight: 0.6 });
  return pts;
}
