"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { conversations } from "@/lib/db/schema";

/** Course baseline: public channels with create / rename / archive. */

export async function createChannelAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const name = String(formData.get("name") ?? "")
    .trim()
    .replace(/^#/, "")
    .slice(0, 40);
  if (!name) return;
  const [convo] = await db
    .insert(conversations)
    .values({ kind: "channel", name, createdBy: user.id })
    .returning({ id: conversations.id });
  redirect(`/channels/${convo.id}`);
}

export async function renameChannelAction(channelId: number, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const name = String(formData.get("name") ?? "")
    .trim()
    .replace(/^#/, "")
    .slice(0, 40);
  if (!name) return;
  const convo = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, channelId), eq(conversations.kind, "channel")),
  });
  if (!convo) return;
  // Announcements is operator-owned; other channels: creator or admin.
  if (convo.isAnnouncements && !user.isAdmin) return;
  if (!user.isAdmin && convo.createdBy !== user.id && convo.createdBy !== null) return;
  await db.update(conversations).set({ name }).where(eq(conversations.id, channelId));
  revalidatePath(`/channels/${channelId}`);
  revalidatePath("/channels");
}

export async function archiveChannelAction(channelId: number) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const convo = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, channelId), eq(conversations.kind, "channel")),
  });
  if (!convo || convo.isAnnouncements) return;
  if (!user.isAdmin && convo.createdBy !== user.id && convo.createdBy !== null) return;
  await db
    .update(conversations)
    .set({ archived: !convo.archived })
    .where(eq(conversations.id, channelId));
  revalidatePath(`/channels/${channelId}`);
  revalidatePath("/channels");
}
