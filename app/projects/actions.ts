"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { joinFitSuggestion } from "@/lib/ai";
import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import {
  cadenceContracts,
  conversations,
  joinRequests,
  messages,
  notifications,
  profiles,
  projectMembers,
  projects,
} from "@/lib/db/schema";
import { profileForMatching } from "@/lib/matching";

export async function getProjectConversation(projectId: number): Promise<number> {
  const existing = await db.query.conversations.findFirst({
    where: and(eq(conversations.kind, "project"), eq(conversations.projectId, projectId)),
  });
  if (existing) return existing.id;
  const [convo] = await db
    .insert(conversations)
    .values({ kind: "project", projectId })
    .returning({ id: conversations.id });
  return convo.id;
}

/** Spec 5.5: join request carries profile, reason, intent, and a labeled AI fit suggestion. */
export async function requestJoinAction(projectId: number, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const reason = String(formData.get("reason") ?? "").trim();
  const intent = String(formData.get("intent") ?? "").trim() || null;
  if (!reason) return;

  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return;

  const already = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)),
  });
  const pending = await db.query.joinRequests.findFirst({
    where: and(
      eq(joinRequests.projectId, projectId),
      eq(joinRequests.applicantId, user.id),
      eq(joinRequests.status, "pending")
    ),
  });
  if (already || pending) return;

  const applicant = await profileForMatching(user.id);
  const fit = applicant
    ? await joinFitSuggestion({
        applicant,
        projectName: project.name,
        projectGoal: project.goal,
        reason,
        intent,
      })
    : null;

  await db.insert(joinRequests).values({
    projectId,
    applicantId: user.id,
    reason: reason.slice(0, 1000),
    intent,
    aiFitSuggestion: fit,
  });

  const leaders = await db.query.projectMembers.findMany({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.isLeader, true)),
  });
  for (const l of leaders) {
    await db.insert(notifications).values({
      userId: l.userId,
      kind: "join_request",
      content: `${user.name} asked to join ${project.name}.`,
      href: `/projects/${projectId}`,
    });
  }
  revalidatePath(`/projects/${projectId}`);
}

async function requireLeader(projectId: number, userId: number) {
  const row = await db.query.projectMembers.findFirst({
    where: and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, userId),
      eq(projectMembers.isLeader, true)
    ),
  });
  return !!row;
}

/** Leaders accept, decline, or ask a follow-up (spec 5.5). */
export async function actOnJoinRequestAction(
  requestId: number,
  action: "accept" | "decline" | "followup",
  formData?: FormData
) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const request = await db.query.joinRequests.findFirst({
    where: eq(joinRequests.id, requestId),
  });
  if (!request || (request.status !== "pending" && request.status !== "followup")) return;
  if (!(await requireLeader(request.projectId, user.id))) return;

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, request.projectId),
  });

  if (action === "followup") {
    const q = String(formData?.get("question") ?? "").trim();
    if (!q) return;
    await db
      .update(joinRequests)
      .set({ status: "followup", followupQuestion: q.slice(0, 500) })
      .where(eq(joinRequests.id, requestId));
    await db.insert(notifications).values({
      userId: request.applicantId,
      kind: "join_decision",
      content: `A leader of ${project?.name ?? "a project"} has a follow-up question on your request.`,
      href: `/projects/${request.projectId}`,
    });
  } else if (action === "decline") {
    await db.update(joinRequests).set({ status: "declined" }).where(eq(joinRequests.id, requestId));
    await db.insert(notifications).values({
      userId: request.applicantId,
      kind: "join_decision",
      content: `Your request to join ${project?.name ?? "a project"} was declined.`,
      href: `/projects/${request.projectId}`,
    });
  } else {
    await db.update(joinRequests).set({ status: "accepted" }).where(eq(joinRequests.id, requestId));
    await db
      .insert(projectMembers)
      .values({ projectId: request.projectId, userId: request.applicantId })
      .onConflictDoNothing();

    // Spec 5.6: the onboarding assumption becomes the new member's first
    // Question — asking framed as a contribution, not a confession.
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, request.applicantId),
    });
    if (profile?.assumption) {
      const convoId = await getProjectConversation(request.projectId);
      await db.insert(messages).values({
        conversationId: convoId,
        senderId: request.applicantId,
        senderKind: "user",
        content: profile.assumption,
        structuredType: "question",
      });
      await db.insert(messages).values({
        conversationId: convoId,
        senderKind: "system",
        content: `That question came from onboarding — everyone names one thing they're assuming someone else knows. Welcome them by answering it if you can.`,
      });
    }

    await db.insert(notifications).values({
      userId: request.applicantId,
      kind: "join_decision",
      content: `You're in — ${project?.name ?? "the project"} accepted your request.`,
      href: `/projects/${request.projectId}`,
    });
  }
  revalidatePath(`/projects/${request.projectId}`);
}

export async function answerFollowupAction(requestId: number, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const answer = String(formData.get("answer") ?? "").trim();
  if (!answer) return;
  const request = await db.query.joinRequests.findFirst({
    where: and(eq(joinRequests.id, requestId), eq(joinRequests.applicantId, user.id)),
  });
  if (!request || request.status !== "followup") return;
  await db
    .update(joinRequests)
    .set({ followupAnswer: answer.slice(0, 1000), status: "pending" })
    .where(eq(joinRequests.id, requestId));
  revalidatePath(`/projects/${request.projectId}`);
}

/** The cadence contract as a simple editable card (spec 5.5, time-tight form). */
export async function saveCadenceAction(projectId: number, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const member = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)),
  });
  if (!member) return;
  const terms = String(formData.get("terms") ?? "").trim();
  if (!terms) return;
  await db
    .insert(cadenceContracts)
    .values({ projectId, terms: terms.slice(0, 1500), updatedBy: user.id })
    .onConflictDoUpdate({
      target: cadenceContracts.projectId,
      set: { terms: terms.slice(0, 1500), updatedBy: user.id, updatedAt: new Date() },
    });
  revalidatePath(`/projects/${projectId}`);
}

/** Topic threads (spec 5.6). */
export async function createThreadAction(projectId: number, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const member = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)),
  });
  if (!member) return;
  const topic = String(formData.get("topic") ?? "").trim().slice(0, 80);
  if (!topic) return;
  const [thread] = await db
    .insert(conversations)
    .values({ kind: "thread", projectId, topic, createdBy: user.id })
    .returning({ id: conversations.id });
  redirect(`/projects/${projectId}/threads/${thread.id}`);
}

/** Decisions can display a resolved state; any member can flip it. */
export async function toggleResolvedAction(messageId: number, projectId: number) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const member = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)),
  });
  if (!member) return;
  const msg = await db.query.messages.findFirst({ where: eq(messages.id, messageId) });
  if (!msg || msg.structuredType !== "decision") return;
  await db
    .update(messages)
    .set({ resolved: !msg.resolved })
    .where(eq(messages.id, messageId));
  revalidatePath(`/projects/${projectId}`);
}
