import { AIRPORTS, findAirport } from "./airports";
import { detectEmptyLeg } from "./detector";
import type { EmptyLegCandidate } from "./types";

interface SeedLeg {
  icao24: string;
  registration: string;
  callsign?: string;
  typecode: string;
  origin: string;
  destination: string;
  departInHours: number;
  groundTimeHours: number;
  priorOrigin?: string;
  priorDestination?: string;
  oneWayRatio7d: number;
  legsLast48h: number;
  notes?: string;
}

const SEEDS: SeedLeg[] = [
  {
    icao24: "a12bc3",
    registration: "N425QS",
    callsign: "EJA425",
    typecode: "C68A",
    origin: "TEB",
    destination: "OPF",
    departInHours: 4,
    groundTimeHours: 3.5,
    priorOrigin: "ASE",
    priorDestination: "TEB",
    oneWayRatio7d: 0.71,
    legsLast48h: 2,
    notes: "Onward ferry after Aspen→Teterboro — classic NE↔FL reposition.",
  },
  {
    icao24: "a98fe1",
    registration: "N650GA",
    callsign: "GLF650",
    typecode: "GLF6",
    origin: "VNY",
    destination: "LAS",
    departInHours: 7,
    groundTimeHours: 22,
    priorOrigin: "LAS",
    priorDestination: "VNY",
    oneWayRatio7d: 0.4,
    legsLast48h: 1,
    notes: "Exact return corridor — model should down-rank vs onward ferries.",
  },
  {
    icao24: "ac01d4",
    registration: "N350CL",
    typecode: "CL35",
    origin: "HPN",
    destination: "PBI",
    departInHours: 11,
    groundTimeHours: 5,
    priorOrigin: "DAL",
    priorDestination: "HPN",
    oneWayRatio7d: 0.66,
    legsLast48h: 3,
    notes: "Asymmetric after Dallas→HPN — strong empty-leg prior.",
  },
  {
    icao24: "a44e09",
    registration: "N889LX",
    typecode: "E55P",
    origin: "APA",
    destination: "ASE",
    departInHours: 2.5,
    groundTimeHours: 28,
    priorOrigin: "SDL",
    priorDestination: "APA",
    oneWayRatio7d: 0.58,
    legsLast48h: 1,
    notes: "Mountain demand spike — idle-then-ferry signal.",
  },
  {
    icao24: "3c4b2a",
    registration: "D-AAAY",
    callsign: "AHO22A",
    typecode: "GLEX",
    origin: "LBG",
    destination: "GVA",
    departInHours: 6,
    groundTimeHours: 4.2,
    priorOrigin: "NCE",
    priorDestination: "LBG",
    oneWayRatio7d: 0.63,
    legsLast48h: 2,
    notes: "EU bizav triangle Nice→Paris→Geneva.",
  },
  {
    icao24: "406b7c",
    registration: "G-LEGC",
    typecode: "FA7X",
    origin: "LTN",
    destination: "NCE",
    departInHours: 15,
    groundTimeHours: 9,
    priorOrigin: "GVA",
    priorDestination: "LTN",
    oneWayRatio7d: 0.6,
    legsLast48h: 2,
  },
  {
    icao24: "a77c10",
    registration: "N720TX",
    typecode: "C700",
    origin: "HOU",
    destination: "TEB",
    departInHours: 9,
    groundTimeHours: 2.8,
    priorOrigin: "SDL",
    priorDestination: "HOU",
    oneWayRatio7d: 0.69,
    legsLast48h: 2,
  },
  {
    icao24: "a0bb21",
    registration: "N280GS",
    typecode: "G280",
    origin: "SDL",
    destination: "BFI",
    departInHours: 18,
    groundTimeHours: 36,
    priorOrigin: "VNY",
    priorDestination: "SDL",
    oneWayRatio7d: 0.52,
    legsLast48h: 1,
  },
  {
    icao24: "7504a1",
    registration: "9V-SGD",
    callsign: "SCOOT1",
    typecode: "GLEX",
    origin: "PVG",
    destination: "SIN",
    departInHours: 5,
    groundTimeHours: 4,
    priorOrigin: "PEK",
    priorDestination: "PVG",
    oneWayRatio7d: 0.67,
    legsLast48h: 2,
    notes: "Shanghai→Singapore ferry — matches SGP homebound demand.",
  },
  {
    icao24: "780abc",
    registration: "B-LUXE",
    typecode: "GLF6",
    origin: "HKG",
    destination: "SIN",
    departInHours: 12,
    groundTimeHours: 8,
    priorOrigin: "SIN",
    priorDestination: "HKG",
    oneWayRatio7d: 0.48,
    legsLast48h: 1,
    notes: "HKG→SIN empty after inbound charter.",
  },
  {
    icao24: "a33f01",
    registration: "N908XP",
    typecode: "CL35",
    origin: "PBI",
    destination: "TEB",
    departInHours: 8,
    groundTimeHours: 3.2,
    priorOrigin: "OPF",
    priorDestination: "PBI",
    oneWayRatio7d: 0.62,
    legsLast48h: 2,
    notes: "Florida→Teterboro homebound ferry for snowbird demand.",
  },
];

export async function buildDemoCandidates(): Promise<EmptyLegCandidate[]> {
  const now = Date.now();
  const out: EmptyLegCandidate[] = [];

  for (const seed of SEEDS) {
    const origin = findAirport(seed.origin) ?? AIRPORTS.TEB;
    const destination = findAirport(seed.destination) ?? AIRPORTS.OPF;
    const priorOrigin = seed.priorOrigin
      ? findAirport(seed.priorOrigin)
      : undefined;
    const priorDestination = seed.priorDestination
      ? findAirport(seed.priorDestination)
      : undefined;

    const { candidate } = await detectEmptyLeg({
      icao24: seed.icao24,
      registration: seed.registration,
      callsign: seed.callsign,
      typecode: seed.typecode,
      origin,
      destination,
      estimatedDeparture: new Date(now + seed.departInHours * 3600_000),
      groundTimeHours: seed.groundTimeHours,
      priorOrigin,
      priorDestination,
      oneWayRatio7d: seed.oneWayRatio7d,
      legsLast48h: seed.legsLast48h,
      source: "demo",
      notes: seed.notes,
      minConfidence: 0.25,
    });

    if (candidate) {
      // Keep the intentional low-confidence return corridor visible for UX.
      if (seed.registration === "N650GA") {
        candidate.status = "predicted";
        candidate.notes = `${candidate.notes ?? ""} (demo: return leg shown for model contrast)`;
      }
      out.push(candidate);
    }
  }

  return out.sort((a, b) => b.confidence - a.confidence);
}
