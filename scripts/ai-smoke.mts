import { generateProfileDraft, bartenderTavern } from '../lib/ai';
const draft = await generateProfileDraft({
  name: 'George Eastwood',
  githubLogin: 'gge513',
  analysis: { languages: ['TypeScript'], topics: ['nextjs'], repoCount: 3, recentRepos: [{ name: 'whose-ball', description: 'momentum tracker for team projects', language: 'TypeScript' }] },
});
console.log('DRAFT OK:', !!draft, draft?.summary?.slice(0, 140));
const t = await bartenderTavern({ ownerName: 'George', transcript: [{ speaker: 'you', content: "Jordan said the PR was ready for review but it does not even build. I feel like he is blowing the project off." }] });
console.log('TAVERN OK:', !!t);
console.log(t?.slice(0, 500));
