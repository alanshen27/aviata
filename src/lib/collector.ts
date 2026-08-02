import { isPrivateJetType } from "./aircraft";
import { nearestAirport } from "./airports";

export interface LiveAircraftSnapshot {
  icao24: string;
  callsign: string | null;
  originCountry: string | null;
  lon: number | null;
  lat: number | null;
  baroAltitude: number | null;
  onGround: boolean;
  velocity: number | null;
  nearestAirportIcao?: string;
  likelyPrivateJet: boolean;
  source: "opensky";
}

/**
 * Poll OpenSky /states/all for a US bounding box.
 * OpenSky free API is research/education only — commercial use needs a license.
 * @see https://opensky-network.org/about/terms-of-use
 */
export async function collectOpenSkySample(): Promise<{
  fetchedAt: string;
  count: number;
  aircraft: LiveAircraftSnapshot[];
  licenseNote: string;
}> {
  const lamin = 24.5;
  const lamax = 49.5;
  const lomin = -125;
  const lomax = -66.5;
  const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lamax=${lamax}&lomin=${lomin}&lomax=${lomax}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "reposition-emptyleg-mvp/0.1 (research)" },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`OpenSky HTTP ${res.status}`);
  }

  const body = (await res.json()) as {
    time: number;
    states: Array<Array<string | number | boolean | null>> | null;
  };

  const aircraft: LiveAircraftSnapshot[] = [];
  for (const row of body.states ?? []) {
    const icao24 = String(row[0] ?? "");
    const callsign = row[1] ? String(row[1]).trim() : null;
    const lat = typeof row[6] === "number" ? row[6] : null;
    const lon = typeof row[5] === "number" ? row[5] : null;
    const onGround = Boolean(row[8]);
    const nearest =
      lat != null && lon != null ? nearestAirport(lat, lon, 25) : undefined;

    // Without typecode enrichment we keep a soft private-jet prior:
    // light traffic near high-FBO airports with sparse callsigns.
    const likelyPrivateJet =
      !!nearest &&
      nearest.privateTrafficScore >= 0.85 &&
      onGround &&
      (!callsign || callsign.length <= 7);

    aircraft.push({
      icao24,
      callsign,
      originCountry: row[2] ? String(row[2]) : null,
      lon,
      lat,
      baroAltitude: typeof row[7] === "number" ? row[7] : null,
      onGround,
      velocity: typeof row[9] === "number" ? row[9] : null,
      nearestAirportIcao: nearest?.icao,
      likelyPrivateJet,
      source: "opensky",
    });
  }

  const filtered = aircraft
    .filter((a) => a.likelyPrivateJet || a.onGround)
    .slice(0, 80);

  return {
    fetchedAt: new Date().toISOString(),
    count: filtered.length,
    aircraft: filtered,
    licenseNote:
      "OpenSky REST API is licensed for non-profit research/education. Any commercial or operational product use requires a written license from OpenSky Network.",
  };
}

/** Placeholder for registry enrichment (FAA / basic-ac-db) once wired. */
export function enrichTypecodeHint(typecode?: string): boolean {
  return isPrivateJetType(typecode);
}
