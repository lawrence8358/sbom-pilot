import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Read-only recovery inspection: never switch, merge, reset or clean worktrees.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const statePath = join(root, '.scratch/sbom-task/implementation-state.json');
const state = JSON.parse(readFileSync(statePath, 'utf8'));
function git(args, cwd = root) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim(); }
  catch { return undefined; }
}
const actualWorktrees = new Map();
for (const block of (git(['worktree', 'list', '--porcelain']) ?? '').split(/\r?\n\r?\n/)) {
  const path = /^worktree (.+)$/m.exec(block)?.[1]?.trim();
  const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]?.trim();
  if (path && branch) actualWorktrees.set(branch, path);
}
const tickets = readdirSync(join(root, '.scratch/sbom-task/issues')).filter(name => /^\d{2}-.+\.md$/.test(name)).sort().map(name => {
  const body = readFileSync(join(root, '.scratch/sbom-task/issues', name), 'utf8');
  const blockers = /^Blocked by: (.+)$/m.exec(body)?.[1]?.trim();
  if (!blockers) throw new Error(`Missing blocking edges: ${name}`);
  return { id: name.slice(0, 2), title: /^# .+?: (.+)$/m.exec(body)?.[1]?.trim(), blockers: [...blockers.matchAll(/\b\d{2}\b/g)].map(match => match[0]) };
});
const integrated = new Set(state.integratedTickets);
const active = new Set(state.activeWorktrees.map(worker => worker.ticket));
const ready = tickets.filter(ticket => !integrated.has(ticket.id) && !active.has(ticket.id) && ticket.blockers.every(id => integrated.has(id)));
console.log(`Integration: ${state.integrationBranch}; actual branch: ${git(['branch', '--show-current']) ?? 'unavailable'}`);
console.log(`HEAD: ${git(['log', '-1', '--format=%h %s']) ?? 'unavailable'}`);
console.log(`Review base: ${state.reviewBase}; no remote writes: ${state.noRemoteWrites}`);
console.log(`Integrated: ${[...integrated].join(', ') || 'none'}`);
console.log(`Dispatch limit: ${state.dispatchPolicy?.maxConcurrentSubagents ?? 'unspecified'} subagent(s); one verified integration before next slice: ${state.dispatchPolicy?.requireVerifiedIntegrationBeforeNextTicket ?? false}`);
console.log(`Unassigned frontier: ${ready.map(ticket => ticket.id).join(', ') || 'none'}`);
const rootStatus = git(['status', '--short']);
console.log(`Integration worktree: ${rootStatus ? `has changes\n${rootStatus}` : 'clean'}`);
for (const worker of state.activeWorktrees) {
  const path = actualWorktrees.get(worker.branch) ?? resolve(root, worker.worktree);
  console.log(`\nTicket ${worker.ticket}: ${worker.branch}; phase: ${worker.phase ?? 'unspecified'}\nWorktree: ${path}`);
  if (!existsSync(path)) { console.log('Worktree missing: inspect retained branch and recreate without overwriting WIP.'); continue; }
  console.log(`HEAD: ${git(['log', '-1', '--format=%h %s'], path) ?? 'unavailable'}`);
  const status = git(['status', '--short'], path);
  console.log(status ? `Uncommitted changes:\n${status}` : 'Worktree clean');
  const checkpoint = join(path, worker.checkpoint);
  console.log(`Checkpoint: ${checkpoint} (${existsSync(checkpoint) ? 'read this before continuing' : 'MISSING; inspect commits/diff before assigning'})`);
}
console.log(`\nReview: ${state.reviewStatus}`);
console.log('External validation still required:');
for (const gate of state.externalValidation ?? []) console.log(`- ${gate}`);
