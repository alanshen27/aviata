import type { AircraftType } from "./types";

/** Charter-relevant ICAO typecodes commonly seen on empty-leg markets. */
export const PRIVATE_JET_TYPES: Record<string, AircraftType> = {
  C25A: {
    icao: "C25A",
    name: "Citation CJ2",
    manufacturer: "Cessna",
    aircraftClass: "very_light",
    typicalSeats: 6,
  },
  C25B: {
    icao: "C25B",
    name: "Citation CJ3",
    manufacturer: "Cessna",
    aircraftClass: "light",
    typicalSeats: 7,
  },
  C25C: {
    icao: "C25C",
    name: "Citation CJ4",
    manufacturer: "Cessna",
    aircraftClass: "light",
    typicalSeats: 8,
  },
  C56X: {
    icao: "C56X",
    name: "Citation Excel / XLS",
    manufacturer: "Cessna",
    aircraftClass: "midsize",
    typicalSeats: 8,
  },
  C680: {
    icao: "C680",
    name: "Citation Sovereign",
    manufacturer: "Cessna",
    aircraftClass: "super_midsize",
    typicalSeats: 9,
  },
  C68A: {
    icao: "C68A",
    name: "Citation Latitude",
    manufacturer: "Cessna",
    aircraftClass: "midsize",
    typicalSeats: 9,
  },
  C700: {
    icao: "C700",
    name: "Citation Longitude",
    manufacturer: "Cessna",
    aircraftClass: "super_midsize",
    typicalSeats: 12,
  },
  C750: {
    icao: "C750",
    name: "Citation X",
    manufacturer: "Cessna",
    aircraftClass: "super_midsize",
    typicalSeats: 8,
  },
  CL30: {
    icao: "CL30",
    name: "Challenger 300",
    manufacturer: "Bombardier",
    aircraftClass: "super_midsize",
    typicalSeats: 9,
  },
  CL35: {
    icao: "CL35",
    name: "Challenger 350",
    manufacturer: "Bombardier",
    aircraftClass: "super_midsize",
    typicalSeats: 10,
  },
  CL60: {
    icao: "CL60",
    name: "Challenger 600/604/605",
    manufacturer: "Bombardier",
    aircraftClass: "heavy",
    typicalSeats: 12,
  },
  G150: {
    icao: "G150",
    name: "Gulfstream G150",
    manufacturer: "Gulfstream",
    aircraftClass: "midsize",
    typicalSeats: 8,
  },
  GALX: {
    icao: "GALX",
    name: "Gulfstream G200",
    manufacturer: "Gulfstream",
    aircraftClass: "super_midsize",
    typicalSeats: 10,
  },
  G280: {
    icao: "G280",
    name: "Gulfstream G280",
    manufacturer: "Gulfstream",
    aircraftClass: "super_midsize",
    typicalSeats: 10,
  },
  GLF4: {
    icao: "GLF4",
    name: "Gulfstream IV / G450",
    manufacturer: "Gulfstream",
    aircraftClass: "heavy",
    typicalSeats: 14,
  },
  GLF5: {
    icao: "GLF5",
    name: "Gulfstream V / G550",
    manufacturer: "Gulfstream",
    aircraftClass: "ultra_long_range",
    typicalSeats: 16,
  },
  GLF6: {
    icao: "GLF6",
    name: "Gulfstream G650",
    manufacturer: "Gulfstream",
    aircraftClass: "ultra_long_range",
    typicalSeats: 18,
  },
  GLEX: {
    icao: "GLEX",
    name: "Global Express / 6000",
    manufacturer: "Bombardier",
    aircraftClass: "ultra_long_range",
    typicalSeats: 14,
  },
  GL5T: {
    icao: "GL5T",
    name: "Global 5000",
    manufacturer: "Bombardier",
    aircraftClass: "ultra_long_range",
    typicalSeats: 13,
  },
  FA7X: {
    icao: "FA7X",
    name: "Falcon 7X",
    manufacturer: "Dassault",
    aircraftClass: "ultra_long_range",
    typicalSeats: 14,
  },
  FA8X: {
    icao: "FA8X",
    name: "Falcon 8X",
    manufacturer: "Dassault",
    aircraftClass: "ultra_long_range",
    typicalSeats: 14,
  },
  F2TH: {
    icao: "F2TH",
    name: "Falcon 2000",
    manufacturer: "Dassault",
    aircraftClass: "super_midsize",
    typicalSeats: 10,
  },
  E55P: {
    icao: "E55P",
    name: "Phenom 300",
    manufacturer: "Embraer",
    aircraftClass: "light",
    typicalSeats: 8,
  },
  E35L: {
    icao: "E35L",
    name: "Legacy 600/650",
    manufacturer: "Embraer",
    aircraftClass: "heavy",
    typicalSeats: 13,
  },
  PC24: {
    icao: "PC24",
    name: "PC-24",
    manufacturer: "Pilatus",
    aircraftClass: "light",
    typicalSeats: 8,
  },
  H25B: {
    icao: "H25B",
    name: "Hawker 800/900",
    manufacturer: "Hawker",
    aircraftClass: "midsize",
    typicalSeats: 8,
  },
};

export function isPrivateJetType(typecode?: string): boolean {
  if (!typecode) return false;
  return typecode.toUpperCase() in PRIVATE_JET_TYPES;
}

export function getAircraftType(typecode: string): AircraftType | undefined {
  return PRIVATE_JET_TYPES[typecode.toUpperCase()];
}
