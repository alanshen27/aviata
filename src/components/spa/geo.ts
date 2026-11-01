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

/** Inverse of latLonToVec3 for a point in the globe's local space. */
export function vec3ToLatLon(x: number, y: number, z: number) {
  const r = Math.hypot(x, y, z) || 1;
  const lat = 90 - Math.acos(y / r) / DEG;
  let lon = Math.atan2(z, -x) / DEG - 180;
  if (lon < -180) lon += 360;
  if (lon > 180) lon -= 360;
  return { lat, lon };
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

/** Midpoint of two lat/lons along the great circle. */
export function midpoint(lat1: number, lon1: number, lat2: number, lon2: number) {
  const a = latLonToVec3(lat1, lon1, 1);
  const b = latLonToVec3(lat2, lon2, 1);
  return vec3ToLatLon(a.x + b.x, a.y + b.y, a.z + b.z);
}

/** Central angle (radians) between two lat/lons. */
export function angularDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const a = latLonToVec3(lat1, lon1, 1);
  const b = latLonToVec3(lat2, lon2, 1);
  const dot = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
  return Math.acos(dot);
}
