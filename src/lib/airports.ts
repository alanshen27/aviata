import type { Airport } from "./types";

/** High private-aviation airports used for demo routing and matching. */
export const AIRPORTS: Record<string, Airport> = {
  TEB: {
    icao: "KTEB",
    iata: "TEB",
    name: "Teterboro",
    city: "Teterboro",
    country: "US",
    lat: 40.8501,
    lon: -74.0608,
    privateTrafficScore: 0.98,
  },
  VNY: {
    icao: "KVNY",
    iata: "VNY",
    name: "Van Nuys",
    city: "Los Angeles",
    country: "US",
    lat: 34.2098,
    lon: -118.49,
    privateTrafficScore: 0.96,
  },
  OPF: {
    icao: "KOPF",
    iata: "OPF",
    name: "Miami-Opa Locka",
    city: "Miami",
    country: "US",
    lat: 25.907,
    lon: -80.2784,
    privateTrafficScore: 0.93,
  },
  LAS: {
    icao: "KLAS",
    iata: "LAS",
    name: "Harry Reid Intl",
    city: "Las Vegas",
    country: "US",
    lat: 36.084,
    lon: -115.1537,
    privateTrafficScore: 0.72,
  },
  ASE: {
    icao: "KASE",
    iata: "ASE",
    name: "Aspen-Pitkin County",
    city: "Aspen",
    country: "US",
    lat: 39.2232,
    lon: -106.8689,
    privateTrafficScore: 0.95,
  },
  APA: {
    icao: "KAPA",
    iata: "APA",
    name: "Centennial",
    city: "Denver",
    country: "US",
    lat: 39.5701,
    lon: -104.8493,
    privateTrafficScore: 0.88,
  },
  DAL: {
    icao: "KDAL",
    iata: "DAL",
    name: "Dallas Love Field",
    city: "Dallas",
    country: "US",
    lat: 32.8471,
    lon: -96.8518,
    privateTrafficScore: 0.8,
  },
  HOU: {
    icao: "KHOU",
    iata: "HOU",
    name: "Hobby",
    city: "Houston",
    country: "US",
    lat: 29.6454,
    lon: -95.2789,
    privateTrafficScore: 0.78,
  },
  PBI: {
    icao: "KPBI",
    iata: "PBI",
    name: "Palm Beach Intl",
    city: "West Palm Beach",
    country: "US",
    lat: 26.6832,
    lon: -80.0956,
    privateTrafficScore: 0.9,
  },
  HPN: {
    icao: "KHPN",
    iata: "HPN",
    name: "Westchester County",
    city: "White Plains",
    country: "US",
    lat: 41.067,
    lon: -73.7076,
    privateTrafficScore: 0.92,
  },
  SDL: {
    icao: "KSDL",
    iata: "SDL",
    name: "Scottsdale",
    city: "Scottsdale",
    country: "US",
    lat: 33.6229,
    lon: -111.9105,
    privateTrafficScore: 0.91,
  },
  BFI: {
    icao: "KBFI",
    iata: "BFI",
    name: "Boeing Field",
    city: "Seattle",
    country: "US",
    lat: 47.53,
    lon: -122.302,
    privateTrafficScore: 0.85,
  },
  LBG: {
    icao: "LFPB",
    iata: "LBG",
    name: "Le Bourget",
    city: "Paris",
    country: "FR",
    lat: 48.9694,
    lon: 2.4414,
    privateTrafficScore: 0.97,
  },
  GVA: {
    icao: "LSGG",
    iata: "GVA",
    name: "Geneva",
    city: "Geneva",
    country: "CH",
    lat: 46.2381,
    lon: 6.1089,
    privateTrafficScore: 0.94,
  },
  LTN: {
    icao: "EGGW",
    iata: "LTN",
    name: "Luton",
    city: "London",
    country: "GB",
    lat: 51.8747,
    lon: -0.3683,
    privateTrafficScore: 0.89,
  },
  NCE: {
    icao: "LFMN",
    iata: "NCE",
    name: "Nice Côte d'Azur",
    city: "Nice",
    country: "FR",
    lat: 43.6584,
    lon: 7.2159,
    privateTrafficScore: 0.93,
  },
};

const BY_ICAO = Object.fromEntries(
  Object.values(AIRPORTS).map((a) => [a.icao, a]),
);

export function findAirport(code: string): Airport | undefined {
  const upper = code.toUpperCase();
  return AIRPORTS[upper] ?? BY_ICAO[upper] ?? BY_ICAO[`K${upper}`];
}

export function nearestAirport(
  lat: number,
  lon: number,
  maxNm = 40,
): Airport | undefined {
  let best: Airport | undefined;
  let bestNm = maxNm;
  for (const airport of Object.values(AIRPORTS)) {
    const nm = haversineNm(lat, lon, airport.lat, airport.lon);
    if (nm < bestNm) {
      bestNm = nm;
      best = airport;
    }
  }
  return best;
}

export function haversineNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3440.065; // Earth radius in nautical miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
