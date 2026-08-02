import type { AircraftClass, PricingPlan } from "./types";

const CLASS_RATE_PER_NM: Record<AircraftClass, number> = {
  very_light: 8,
  light: 12,
  midsize: 18,
  super_midsize: 26,
  heavy: 38,
  ultra_long_range: 52,
};

const CLASS_MINIMUM: Record<AircraftClass, number> = {
  very_light: 2500,
  light: 3500,
  midsize: 5500,
  super_midsize: 8500,
  heavy: 12000,
  ultra_long_range: 18000,
};

/** Rough market charter quote for a one-way reposition distance. */
export function estimateFullCharterUsd(
  distanceNm: number,
  aircraftClass: AircraftClass,
): number {
  const raw = distanceNm * CLASS_RATE_PER_NM[aircraftClass];
  return Math.round(Math.max(CLASS_MINIMUM[aircraftClass], raw) / 100) * 100;
}

/** Empty legs typically clear at 30–70% off full one-way charter. */
export function estimateEmptyLegPriceUsd(
  fullCharterUsd: number,
  confidence: number,
): { price: number; discountPct: number } {
  const discountPct = Math.round(35 + confidence * 30);
  const price =
    Math.round((fullCharterUsd * (1 - discountPct / 100)) / 100) * 100;
  return { price, discountPct };
}

export const PLANS: PricingPlan[] = [
  {
    id: "scout",
    name: "Scout",
    priceMonthlyUsd: 0,
    blurb: "Delayed OSINT deals, refreshed every few hours.",
    features: [
      "Public empty-leg board",
      "Heuristic + ML confidence scores",
      "Email digest (daily)",
    ],
    cta: "Browse free",
  },
  {
    id: "radar",
    name: "Radar",
    priceMonthlyUsd: 49,
    blurb: "Real-time alerts when OSINT models fire on your corridors.",
    features: [
      "Push alerts under 5 minutes",
      "Origin / destination filters",
      "XGBoost + LSTM ensemble scores",
      "Aircraft class filters",
    ],
    cta: "Start Radar",
  },
  {
    id: "broker",
    name: "Broker",
    priceMonthlyUsd: 299,
    blurb: "API + webhook feed for desks that sell the seats.",
    features: [
      "REST + webhook stream",
      "Raw feature vectors",
      "Operator match hints",
      "Priority support",
    ],
    cta: "Get Broker access",
  },
];
