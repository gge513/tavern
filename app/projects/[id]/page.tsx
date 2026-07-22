import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";

import { Chat } from "@/app/components/chat";
import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import {
  cadenceContracts,
  conversations,
  joinRequests,
  profiles,
  projectMembers,
  projects,
  users,
} from "@/lib/db/schema";
import { formatTraits } from "@/lib/traits";
import {
  actOnJoinRequestAction,
  answerFollowupAction,
  createThreadAction,
  getProjectConversation,
  requestJoinAction,
  saveCadenceAction,
} from "../actions";

export default async function ProjectPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const { id } = await props.params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) notFound();

  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) notFound();

  const members = await db
    .select({ id: users.id, name: users.name, isLeader: projectMembers.isLeader, isSeed: users.isSeed })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId));

  const me = members.find((m) => m.id === user.id);
  const isMember = !!me;
  const isLeader = !!me?.isLeader;

  const cadence = await db.query.cadenceContracts.findFirst({
    where: eq(cadenceContracts.projectId, projectId),
  });

  const myRequest = await db.query.joinRequests.findFirst({
    where: and(eq(joinRequests.projectId, projectId), eq(joinRequests.applicantId, user.id)),
    orderBy: (r, { desc }) => [desc(r.id)],
  });

  if (!isMember) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <ProjectHeader project={project} members={members} />
        {cadence && <CadenceCard terms={cadence.terms} editable={false} projectId={projectId} />}

        {myRequest?.status === "pending" && (
          <div className="card p-4 text-sm text-dim">
            Your request is with the leaders. You&apos;ll get a notification either way.
          </div>
        )}

        {myRequest?.status === "followup" && (
          <div className="card p-4 space-y-3">
            <p className="text-sm">
              <span className="label">A leader asked</span>
              {myRequest.followupQuestion}
            </p>
            <form action={answerFollowupAction.bind(null, myRequest.id)} className="space-y-2">
              <textarea className="input min-h-20" name="answer" required placeholder="Your answer" />
              <button className="btn text-sm">Send answer</button>
            </form>
          </div>
        )}

        {(!myRequest || myRequest.status === "declined") && (
          <div className="card p-4 space-y-3">
            <h2 className="font-semibold">Ask to join</h2>
            <p className="text-xs text-dim">
              Your public profile travels with this request, along with an AI
              fit suggestion — clearly labeled as a suggestion, and the leaders
              make the call.
            </p>
            <form action={requestJoinAction.bind(null, projectId)} className="space-y-3">
              <div>
                <label className="label" htmlFor="reason">Why this project</label>
                <textarea className="input min-h-20" id="reason" name="reason" required />
              </div>
              <div>
                <label className="label" htmlFor="intent">
                  What you want to contribute — and learn
                </label>
                <input className="input" id="intent" name="intent" />
              </div>
              <button className="btn">Send request</button>
            </form>
          </div>
        )}
      </div>
    );
  }

  const conversationId = await getProjectConversation(projectId);
  const threads = await db.query.conversations.findMany({
    where: and(eq(conversations.kind, "thread"), eq(conversations.projectId, projectId)),
    orderBy: [asc(conversations.id)],
  });

  const pendingRequests = isLeader
    ? await db.query.joinRequests.findMany({
        where: and(
          eq(joinRequests.projectId, projectId),
          inArray(joinRequests.status, ["pending", "followup"])
        ),
      })
    : [];
  const requestDetails = await Promise.all(
    pendingRequests.map(async (r) => {
      const applicant = await db.query.users.findFirst({ where: eq(users.id, r.applicantId) });
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, r.applicantId),
      });
      return { r, applicant, profile };
    })
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <ProjectHeader project={project} members={members} />

      <CadenceCard
        terms={
          cadence?.terms ??
          "Proposed rhythm (edit by consent): one synchronous meeting a week, async check-ins in the project chat, expansion only after people have shown up regularly. Deliberately low-pressure — this is a floor, not a surveillance system."
        }
        editable
        projectId={projectId}
      />

      {isLeader && requestDetails.length > 0 && (
        <div className="space-y-3">
          <h2 className="label">Join requests</h2>
          {requestDetails.map(({ r, applicant, profile }) => (
            <div key={r.id} className="card p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Link href={`/people/${applicant?.id}`} className="font-semibold hover:underline">
                  {applicant?.name}
                </Link>
                <span className="text-xs text-dim">
                  {formatTraits(profile?.contribution ?? null)}
                </span>
              </div>
              <p><span className="label">Why</span>{r.reason}</p>
              {r.intent && <p><span className="label">Intent</span>{r.intent}</p>}
              {r.followupQuestion && (
                <p>
                  <span className="label">Follow-up asked</span>
                  {r.followupQuestion}
                  {r.followupAnswer && (
                    <>
                      <span className="label mt-2">Their answer</span>
                      {r.followupAnswer}
                    </>
                  )}
                </p>
              )}
              {r.aiFitSuggestion && (
                <p className="border-l-2 pl-3" style={{ borderColor: "var(--amber-dim)" }}>
                  <span className="ai-label">AI fit suggestion — not a verdict</span>
                  <br />
                  {r.aiFitSuggestion}
                </p>
              )}
              <div className="flex gap-2 pt-1 flex-wrap">
                <form action={actOnJoinRequestAction.bind(null, r.id, "accept")}>
                  <button className="btn text-xs">Accept</button>
                </form>
                <form action={actOnJoinRequestAction.bind(null, r.id, "decline")}>
                  <button className="btn btn-ghost text-xs">Decline</button>
                </form>
                <form
                  action={actOnJoinRequestAction.bind(null, r.id, "followup")}
                  className="flex gap-1 flex-1 min-w-52"
                >
                  <input className="input text-xs py-1" name="question" placeholder="Ask a follow-up…" />
                  <button className="btn btn-ghost text-xs">Ask</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="label mb-0">Topic threads</h2>
          {threads.map((t) => (
            <Link key={t.id} href={`/projects/${projectId}/threads/${t.id}`} className="tag hover:text-ink">
              {t.topic}
            </Link>
          ))}
          <form action={createThreadAction.bind(null, projectId)} className="flex gap-1">
            <input className="input text-xs py-1 w-36" name="topic" placeholder="new thread topic" />
            <button className="btn btn-ghost text-xs">Start</button>
          </form>
        </div>
      </div>

      <div>
        <h2 className="label">Project chat</h2>
        <Chat
          conversationId={conversationId}
          currentUserId={user.id}
          canPost
          showStructured
          members={members.map((m) => ({ id: m.id, name: m.name }))}
          placeholder="Message the project… tag it as a Question, Decision, Blocker, Help request, or Action item if it is one (optional, one tap)"
        />
      </div>
    </div>
  );
}

function ProjectHeader(props: {
  project: { name: string; goal: string; currentState: string | null; repoUrl: string | null; isSeed: boolean };
  members: { id: number; name: string; isLeader: boolean }[];
}) {
  const { project, members } = props;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        {project.isSeed && <span className="tag">seeded from week one</span>}
        {project.repoUrl && (
          <a href={project.repoUrl} target="_blank" rel="noreferrer" className="text-xs text-dim hover:text-ink">
            repo ↗
          </a>
        )}
      </div>
      <p className="text-dim text-sm">{project.goal}</p>
      {project.currentState && (
        <p className="text-xs text-dim">Current state: {project.currentState}</p>
      )}
      <p className="text-xs text-dim">
        {members.filter((m) => m.isLeader).length > 0 && (
          <>Leaders: {members.filter((m) => m.isLeader).map((m) => m.name).join(", ")} · </>
        )}
        Members:{" "}
        {members.map((m, i) => (
          <span key={m.id}>
            {i > 0 && ", "}
            <Link href={`/people/${m.id}`} className="hover:underline">{m.name}</Link>
          </span>
        ))}
      </p>
    </div>
  );
}

function CadenceCard(props: { terms: string; editable: boolean; projectId: number }) {
  return (
    <div className="card p-4 space-y-2">
      <div className="label">Cadence contract — editable by consent</div>
      {props.editable ? (
        <form action={saveCadenceAction.bind(null, props.projectId)} className="space-y-2">
          <textarea className="input min-h-24 text-sm" name="terms" defaultValue={props.terms} />
          <button className="btn btn-ghost text-xs">Save rhythm</button>
        </form>
      ) : (
        <p className="text-sm text-dim whitespace-pre-wrap">{props.terms}</p>
      )}
    </div>
  );
}
