import type { EmptyLegCandidate } from "@/lib/types";

const DEG = Math.PI / 180;

/** Convert lat/lon to a point on a sphere of radius r (Y-up, Z toward 0°E). */
export function latLonToVec3(lat: number, lon: number, r = 1) {
  const φ = (90 - lat) * DEG;
  const θ = (lon + 180) * DEG;
  return {
    x: -r * Math.sin(φ) * Math.cos(θ),
    y: r * Math.cos(φ),
    z: r * Math.sin(φ) * Math.sin(θ),
  };
}

/** Great-circle-ish arc points between two lat/lons, lifted above the surface. */
export function arcPoints(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  segments = 48,
  radius = 1,
  altitude = 0.08,
) {
  const a = latLonToVec3(lat1, lon1, 1);
  const b = latLonToVec3(lat2, lon2, 1);
  const points: { x: number; y: number; z: number }[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // slerp-ish via normalize lerp
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    const len = Math.hypot(x, y, z) || 1;
    const lift = Math.sin(Math.PI * t) * altitude;
    const scale = radius * (1 + lift);
    points.push({
      x: (x / len) * scale,
      y: (y / len) * scale,
      z: (z / len) * scale,
    });
  }
  return points;
}

export function legsToArcs(legs: EmptyLegCandidate[], limit = 12) {
  return legs.slice(0, limit).map((leg) => ({
    id: leg.id,
    origin: {
      lat: leg.origin.lat,
      lon: leg.origin.lon,
      code: leg.origin.iata ?? leg.origin.icao,
    },
    destination: {
      lat: leg.destination.lat,
      lon: leg.destination.lon,
      code: leg.destination.iata ?? leg.destination.icao,
    },
    confidence: leg.confidence,
    aircraftClass: leg.aircraftType.aircraftClass,
  }));
}
