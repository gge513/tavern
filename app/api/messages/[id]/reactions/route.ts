import { NextRequest, NextResponse } from "next/server";

import { currentDbUserId } from "@/lib/current-user";
import { toggleReaction } from "@/lib/messaging";

/** Toggle the caller's reaction on a message. Body: { emoji } from the house set. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const userId = await currentDbUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const messageId = Number(id);
  if (!Number.isInteger(messageId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  let body: { emoji?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (!body.emoji) return NextResponse.json({ error: "empty" }, { status: 400 });

  const result = await toggleReaction(userId, messageId, body.emoji);
  if (!result.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
