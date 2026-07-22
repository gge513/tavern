/**
 * Public-GitHub-only analysis for profile drafts (spec 5.1).
 * Never requests private repository access; degrades gracefully:
 * full recent-repo detail → languages/topics only → null (manual profile).
 */

export type GithubAnalysis = {
  languages?: string[];
  topics?: string[];
  repoCount?: number;
  recentRepos?: { name: string; description: string | null; language: string | null }[];
  degraded?: string;
};

const GH = "https://api.github.com";

function ghHeaders(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "reprise-cohort-app",
  };
  // A PAT only raises the rate limit; everything fetched is public either way.
  if (process.env.GITHUB_PAT) h.Authorization = `Bearer ${process.env.GITHUB_PAT}`;
  return h;
}

export async function analyzeGithub(login: string): Promise<GithubAnalysis | null> {
  try {
    const res = await fetch(
      `${GH}/users/${encodeURIComponent(login)}/repos?sort=pushed&per_page=30&type=owner`,
      { headers: ghHeaders(), cache: "no-store" }
    );
    if (!res.ok) return null;
    const repos = (await res.json()) as {
      name: string;
      description: string | null;
      language: string | null;
      topics?: string[];
      fork: boolean;
      private: boolean;
    }[];

    const own = repos.filter((r) => !r.fork && !r.private);
    const languages = [
      ...new Set(own.map((r) => r.language).filter((l): l is string => !!l)),
    ];
    const topics = [...new Set(own.flatMap((r) => r.topics ?? []))].slice(0, 12);
    return {
      languages,
      topics,
      repoCount: own.length,
      recentRepos: own.slice(0, 8).map((r) => ({
        name: r.name,
        description: r.description,
        language: r.language,
      })),
    };
  } catch {
    return null;
  }
}
