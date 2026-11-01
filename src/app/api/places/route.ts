import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UA = "aviata/0.3 (empty-leg globe; contact via repo)";
const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 3600_000;

async function cached(url: string) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.body;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const body = await res.json();
  cache.set(url, { at: Date.now(), body });
  return body;
}

interface NominatimHit {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  type: string;
  class: string;
  address?: Record<string, string>;
}

function label(h: NominatimHit) {
  const a = h.address ?? {};
  const main = h.name || h.display_name.split(",")[0];
  const second = a.state || a.country || "";
  return second && second !== main ? `${main}, ${second}` : main;
}

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  try {
    if (sp.has("lat") && sp.has("lon")) {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${Number(sp.get("lat"))}&lon=${Number(sp.get("lon"))}`;
      const h = (await cached(url)) as NominatimHit & { error?: string };
      if (h.error) return NextResponse.json({ place: null });
      const a = h.address ?? {};
      const name = a.city || a.town || a.village || a.county || a.state || a.country || h.name || null;
      return NextResponse.json({
        place: name ? { label: a.country && name !== a.country ? `${name}, ${a.country}` : name } : null,
      });
    }
    const q = (sp.get("q") ?? "").trim();
    if (q.length < 3) return NextResponse.json({ places: [] });
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`;
    const hits = (await cached(url)) as NominatimHit[];
    const places = hits
      .filter((h) => !["aeroway"].includes(h.class))
      .map((h) => ({
        id: `osm_${h.place_id}`,
        label: label(h),
        lat: Number(h.lat),
        lon: Number(h.lon),
        type: h.type,
      }));
    return NextResponse.json({ places });
  } catch {
    return NextResponse.json({ places: [], place: null });
  }
}
