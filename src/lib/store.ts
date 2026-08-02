import { buildDemoCandidates } from "./demoLegs";
import type { AlertSubscription, EmptyLegCandidate, PlanId } from "./types";

let legsCache: EmptyLegCandidate[] | null = null;
let legsLoadedAt = 0;
const subscriptions: AlertSubscription[] = [];

const CACHE_MS = 60_000;

export async function getLegs(force = false): Promise<EmptyLegCandidate[]> {
  const stale = Date.now() - legsLoadedAt > CACHE_MS;
  if (!legsCache || force || stale) {
    legsCache = await buildDemoCandidates();
    legsLoadedAt = Date.now();
  }
  return legsCache;
}

export async function getLeg(id: string): Promise<EmptyLegCandidate | undefined> {
  const legs = await getLegs();
  return legs.find((l) => l.id === id);
}

export function createSubscription(input: {
  email: string;
  plan: PlanId;
  origins?: string[];
  destinations?: string[];
  minDiscountPct?: number;
}): AlertSubscription {
  const sub: AlertSubscription = {
    id: `sub_${Date.now().toString(36)}`,
    email: input.email.trim().toLowerCase(),
    plan: input.plan,
    origins: input.origins ?? [],
    destinations: input.destinations ?? [],
    minDiscountPct: input.minDiscountPct ?? 30,
    aircraftClasses: [],
    createdAt: new Date().toISOString(),
    status: input.plan === "scout" ? "active" : "pending_payment",
  };
  subscriptions.unshift(sub);
  return sub;
}

export function listSubscriptions(): AlertSubscription[] {
  return [...subscriptions];
}
