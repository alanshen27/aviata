import { NextResponse } from "next/server";
import { createSubscription, listSubscriptions } from "@/lib/store";
import type { PlanId } from "@/lib/types";

export const dynamic = "force-dynamic";

const PLANS: PlanId[] = ["scout", "radar", "broker"];

export async function GET() {
  return NextResponse.json({ subscriptions: listSubscriptions() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    plan?: PlanId;
    origins?: string[];
    destinations?: string[];
    minDiscountPct?: number;
  };

  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!body.plan || !PLANS.includes(body.plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const sub = createSubscription({
    email: body.email,
    plan: body.plan,
    origins: body.origins,
    destinations: body.destinations,
    minDiscountPct: body.minDiscountPct,
  });

  return NextResponse.json({
    subscription: sub,
    checkout:
      sub.status === "pending_payment"
        ? {
            message:
              "Stripe checkout placeholder — wire STRIPE_SECRET_KEY to charge Radar/Broker.",
            amountUsd:
              body.plan === "radar" ? 49 : body.plan === "broker" ? 299 : 0,
          }
        : null,
  });
}
