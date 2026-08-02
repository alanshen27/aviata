import type { TravelerProfile } from "../types";

/** Demo: Singapore-based traveler with a China corridor and ~7-day stays. */
export const DEMO_TRAVELERS: TravelerProfile[] = [
  {
    id: "trav_sgp_china",
    displayName: "Alex Tan",
    homeAirport: "SIN",
    currentAirport: "PVG",
    // Arrived in Shanghai ~7.2 days ago → return window open
    arrivedAtCurrent: daysAgoIso(7.2),
    trips: [
      {
        origin: "SIN",
        destination: "PVG",
        departedAt: daysAgoIso(90),
        returnedAt: daysAgoIso(83),
        stayDays: 7,
      },
      {
        origin: "PVG",
        destination: "SIN",
        departedAt: daysAgoIso(83),
      },
      {
        origin: "SIN",
        destination: "HKG",
        departedAt: daysAgoIso(60),
        returnedAt: daysAgoIso(55),
        stayDays: 5,
      },
      {
        origin: "HKG",
        destination: "SIN",
        departedAt: daysAgoIso(55),
      },
      {
        origin: "SIN",
        destination: "PVG",
        departedAt: daysAgoIso(35),
        returnedAt: daysAgoIso(27),
        stayDays: 8,
      },
      {
        origin: "PVG",
        destination: "SIN",
        departedAt: daysAgoIso(27),
      },
      {
        origin: "SIN",
        destination: "PVG",
        departedAt: daysAgoIso(7.2),
        stayDays: 7,
      },
    ],
  },
  {
    id: "trav_teb_snowbird",
    displayName: "Jordan Lee",
    homeAirport: "TEB",
    currentAirport: "PBI",
    arrivedAtCurrent: daysAgoIso(10),
    trips: [
      {
        origin: "TEB",
        destination: "PBI",
        departedAt: daysAgoIso(100),
        returnedAt: daysAgoIso(90),
        stayDays: 10,
      },
      {
        origin: "PBI",
        destination: "TEB",
        departedAt: daysAgoIso(90),
      },
      {
        origin: "TEB",
        destination: "PBI",
        departedAt: daysAgoIso(10),
        stayDays: 10,
      },
    ],
  },
];

export function getDemoTraveler(id?: string | null): TravelerProfile {
  return (
    DEMO_TRAVELERS.find((t) => t.id === id) ??
    DEMO_TRAVELERS[0]
  );
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
