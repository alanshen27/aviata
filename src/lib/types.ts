export type AircraftClass =
  | "very_light"
  | "light"
  | "midsize"
  | "super_midsize"
  | "heavy"
  | "ultra_long_range";

export interface AircraftType {
  icao: string;
  name: string;
  manufacturer: string;
  aircraftClass: AircraftClass;
  typicalSeats: number;
}

export interface Airport {
  icao: string;
  iata?: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  /** Higher = more private-aviation / FBO activity */
  privateTrafficScore: number;
}

export interface FlightObservation {
  icao24: string;
  registration?: string;
  callsign?: string;
  typecode?: string;
  originIcao?: string;
  destinationIcao?: string;
  departureTime: string;
  arrivalTime?: string;
  onGround: boolean;
  lat?: number;
  lon?: number;
  altitudeFt?: number;
  source: DataSource;
}

export type DataSource = "demo" | "opensky" | "adsb_exchange" | "operator_feed";

export type EmptyLegSignal =
  | "asymmetric_route"
  | "short_turnaround"
  | "reposition_corridor"
  | "idle_then_ferry"
  | "one_way_pattern"
  | "fbo_pair";

export interface EmptyLegCandidate {
  id: string;
  icao24: string;
  registration: string;
  callsign?: string;
  aircraftType: AircraftType;
  origin: Airport;
  destination: Airport;
  estimatedDeparture: string;
  estimatedArrival: string;
  distanceNm: number;
  confidence: number;
  signals: EmptyLegSignal[];
  status: "predicted" | "airborne" | "listed" | "expired";
  /** Estimated operator asking price in USD if sold as empty leg */
  estimatedPriceUsd: number;
  /** Rough full charter price for the same route */
  fullCharterUsd: number;
  discountPct: number;
  source: DataSource;
  detectedAt: string;
  notes?: string;
}

export type PlanId = "scout" | "radar" | "broker";

export interface AlertSubscription {
  id: string;
  email: string;
  plan: PlanId;
  origins: string[];
  destinations: string[];
  minDiscountPct: number;
  aircraftClasses: AircraftClass[];
  createdAt: string;
  status: "pending_payment" | "active" | "cancelled";
}

export interface PricingPlan {
  id: PlanId;
  name: string;
  priceMonthlyUsd: number;
  blurb: string;
  features: string[];
  cta: string;
}

/** One completed passenger trip used for personalization. */
export interface TravelerTrip {
  origin: string;
  destination: string;
  departedAt: string;
  returnedAt?: string;
  /** Nights away before returning home; learned from history when omitted */
  stayDays?: number;
}

export interface TravelerProfile {
  id: string;
  displayName: string;
  /** Home / base airport (IATA or ICAO) */
  homeAirport: string;
  trips: TravelerTrip[];
  /** Where they are right now, if different from home */
  currentAirport?: string;
  /** ISO time they arrived at currentAirport */
  arrivedAtCurrent?: string;
}

export interface ReturnPrediction {
  homeAirport: string;
  currentAirport: string;
  daysAway: number;
  predictedStayDays: number;
  /** Probability they want a homebound flight in the next window */
  returnProbability: number;
  /** Suggested search window in days from now */
  recommendInDays: number;
  reason: string;
  backend: "transformer" | "lstm" | "builtin";
}

export interface FlightRecommendation {
  id: string;
  score: number;
  kind: "return_home" | "next_corridor" | "explore";
  reason: string;
  prediction: ReturnPrediction;
  leg: EmptyLegCandidate;
}
