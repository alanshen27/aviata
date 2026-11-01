import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getLiveLegs } from "@/lib/listings";
import { haversineKm } from "@/lib/airportTable";
import {
  VISITOR_COOKIE,
  interestPoints,
  newVisitorId,
  touchVisitor,
} from "@/lib/visitors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const jar = await cookies();
  let id = jar.get(VISITOR_COOKIE)?.value;
  const fresh = !id;
  if (!id) id = newVisitorId();

  const v = await touchVisitor(id, request.headers);
  const legs = await getLiveLegs();
  const points = interestPoints(v);

  const scored = legs
    .map((leg) => {
      let best = 0;
      for (const p of points) {
        const d = Math.min(
          haversineKm(p.lat, p.lon, leg.origin.lat, leg.origin.lon),
          haversineKm(p.lat, p.lon, leg.destination.lat, leg.destination.lon),
        );
        const s = p.weight * Math.max(0, 1 - d / 1500);
        if (s > best) best = s;
      }
      return { id: leg.id, score: best };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);

  const res = NextResponse.json({
    visitorId: id,
    geo: v.geo,
    home: v.home,
    visits: v.visits,
    recent: v.events.slice(-8).reverse(),
    nearIds: scored.map((s) => s.id),
  });
  if (fresh) {
    res.cookies.set(VISITOR_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}
