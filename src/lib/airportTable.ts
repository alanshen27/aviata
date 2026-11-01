import table from "@/data/airports.json";

/** [lat, lon, name, city, country, icao, size(0 small,1 medium,2 large)] */
type Row = [number, number, string, string, string, string, number];

export interface AirportInfo {
  code: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  size: number;
}

const ROWS = table as unknown as Record<string, Row>;
let byIcao: Map<string, string> | null = null;

function toInfo(code: string, r: Row): AirportInfo {
  return {
    code,
    lat: r[0],
    lon: r[1],
    name: r[2],
    city: r[3],
    country: r[4],
    icao: r[5],
    size: r[6],
  };
}

export function lookupAirport(code: string | null | undefined): AirportInfo | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  const direct = ROWS[c];
  if (direct) return toInfo(c, direct);
  if (!byIcao) {
    byIcao = new Map();
    for (const [k, r] of Object.entries(ROWS)) byIcao.set(r[5], k);
  }
  const viaIcao = byIcao.get(c) ?? (c.length === 3 ? byIcao.get(`K${c}`) : undefined);
  if (viaIcao) return toInfo(viaIcao, ROWS[viaIcao]);
  return null;
}

export function searchAirports(query: string, limit = 6): AirportInfo[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored: Array<[number, AirportInfo]> = [];
  for (const [code, r] of Object.entries(ROWS)) {
    const lc = code.toLowerCase();
    const city = r[3].toLowerCase();
    const name = r[2].toLowerCase();
    let s = 0;
    if (lc === q) s = 100;
    else if (lc.startsWith(q)) s = 60;
    else if (city.startsWith(q)) s = 50;
    else if (name.startsWith(q)) s = 40;
    else if (q.length >= 3 && (city.includes(q) || name.includes(q))) s = 20;
    if (s === 0) continue;
    s += r[6] * 5 + (code.length === 3 ? 3 : 0);
    scored.push([s, toInfo(code, r)]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, limit).map((x) => x[1]);
}

const R_KM = 6371;
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const d = Math.PI / 180;
  const dLat = (lat2 - lat1) * d;
  const dLon = (lon2 - lon1) * d;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(a));
}

export function nearestAirport(lat: number, lon: number, minSize = 1): AirportInfo | null {
  let best: AirportInfo | null = null;
  let bestD = Infinity;
  for (const [code, r] of Object.entries(ROWS)) {
    if (r[6] < minSize) continue;
    const d = haversineKm(lat, lon, r[0], r[1]);
    if (d < bestD) {
      bestD = d;
      best = toInfo(code, r);
    }
  }
  return best;
}
