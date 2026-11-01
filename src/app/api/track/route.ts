import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { VISITOR_COOKIE, recordEvent, type VisitorEvent } from "@/lib/visitors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const jar = await cookies();
  const id = jar.get(VISITOR_COOKIE)?.value;
  if (!id) return NextResponse.json({ ok: false }, { status: 204 });
  const body = (await request.json().catch(() => null)) as Partial<VisitorEvent> | null;
  if (!body || typeof body.type !== "string") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  recordEvent(id, { ...body, at: new Date().toISOString() } as VisitorEvent);
  return NextResponse.json({ ok: true });
}
