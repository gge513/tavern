import { NextRequest, NextResponse } from "next/server";

import { bartenderTavern } from "@/lib/ai";
import { currentDbUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { conversations, messages, tavernSessions, users } from "@/lib/db/schema";
import { canAccess, listMessages, sendMessage } from "@/lib/messaging";
import { and, eq } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const userId = await currentDbUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const access = await canAccess(userId, conversationId);
  if (!access.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const after = Number(req.nextUrl.searchParams.get("after") ?? 0) || 0;
  const rows = await listMessages(conversationId, after > 0 ? after : undefined);
  return NextResponse.json({ messages: rows });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const userId = await currentDbUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  let body: {
    content?: string;
    structuredType?: "question" | "decision" | "blocker" | "help" | "action" | null;
    ownerId?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (!body.content?.trim()) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  const result = await sendMessage(userId, conversationId, body.content, {
    structuredType: body.structuredType ?? null,
    ownerId: body.ownerId ?? null,
  });
  if (!result.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Tavern conversations get an in-line bartender reply (private, narrow memory).
  const convo = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (convo?.kind === "tavern") {
    const session = await db.query.tavernSessions.findFirst({
      where: and(
        eq(tavernSessions.conversationId, conversationId),
        eq(tavernSessions.ownerId, userId)
      ),
    });
    if (session && !session.outcome) {
      const owner = await db.query.users.findFirst({ where: eq(users.id, userId) });
      const history = await listMessages(conversationId);
      const reply =
        (await bartenderTavern({
          ownerName: owner?.name ?? "friend",
          transcript: history.map((m) => ({
            speaker: m.senderKind === "bartender" ? "bartender" : "you",
            content: m.content,
          })),
        })) ??
        "Say more about what actually happened — the words that were said, before any reading of them.";
      await db.insert(messages).values({
        conversationId,
        senderKind: "bartender",
        content: reply,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
