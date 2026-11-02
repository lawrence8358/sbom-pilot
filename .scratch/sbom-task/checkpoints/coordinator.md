# Coordinator recovery checkpoint

## Start here

Run `node scripts/resume.mjs` in the integration worktree, then read `implementation-state.json` and the target worker checkpoint in its own worktree. Git HEAD/status are authoritative when this summary is older. Resume existing work; no remote writes or PR.

## Persisted state

- Initial spec/ticket commit on main: `e3a5bf6`; code-review fixed point stays this commit.
- Integration branch: `feature/sbom-pilot` in `D:/Project/Git/sbom-pilot`.
- Ticket 01 code: `a543dc9`; merged by merger in `f8abe50`.
- Recovery workflow/dispatch manifest/read-only resume inspector: `caa7f3c`.
- Ticket 02: branch `ticket/02-options`, WIP `944d6aa`; checkpoint and later test fix in its existing worktree. Finish option validation/smoke; Ajv upgraded to8.20.0.
- Ticket 03: branch `ticket/03-pnpm`, coordinator preserved interrupted work in `2d02f77`; checkpoint exists. Typecheck passed after resumption; JS detection/manager/pnpm modules need tests and real smoke.
- Ticket 05: branch `ticket/05-dotnet`, WIP `75ddc45`; JSONC dependency and detailed plan checkpointed, product code still being implemented at recovery.
- Workers were resumed after the user's explicit continue instruction. Agent IDs/conversations can be replaced; branches/worktrees/checkpoints retain the work.

## Validation already performed

- On baseline01: Windows `npm test` 10/10, build, developer VSIX packaging, cold real Node24.22.2/cdxgen13.6.0 Vue smoke passed. Vue present, dev-only chalk absent,23 schema-valid components, lockfile unchanged.
- Root merger independently ran npm ci/test/build successfully on integration.
- Root ran Linux Docker `node:24-bookworm` (digest `sha256:e7add2a490bb17d97b485b8641bd88455fff7839ade0f5eba493c3508124d413`): fresh npm ci,10/10 tests, build, cold real tool smoke all passed.23 components, same Vue/chalk and lock invariants. Container was removed normally. This is local Linux scan evidence, not a live Agent run.
- Production audit baseline had direct Ajv8.17.1 moderate (02 upgrades) plus task-lib/tool-lib transitive minimatch advisory with no compatible upstream fix. Do not blindly override minimatch to a breaking major; reassess audit on final lockfile.

## Remaining graph and integration

- Currently implemented only01.02/03/05 are in progress.04,08,11 are unassigned frontier;06 follows05;07 follows02/03/04/05;09 follows03/04;10 follows06;12 follows07/08/09/10/11.
- Once a worker has final commit, use a merger subagent to merge into integration. Root should not mutate integration simultaneously. Preserve all config/workflow/manifest behavior across parallel branches; resolve package-lock from merged package manifests and rerun checks if conflict requires regeneration.
-03 owns generic JS installer dispatch and test discovery;05 adds modern.NET dispatch;02 owns config/options, so shared workflow/config/manifest edits may need semantic merging.
- After integration, update `integratedTickets` and active leases, progress/evidence, and recompute frontier. Save checkpoints before any new long-running task.
- Final Standards/Spec review has NOT started. Must run both against `e3a5bf6...HEAD`, fix findings in an isolated implementer worktree, verify and commit.

## Known environment / external gates

- Windows Node24.22.1/npm11.19.1; .NET SDKs6.0.428/9.0.316/10.0.101; VS2022 Enterprise MSBuild; Docker29.1.3 available. WSLUbuntu24.04 has no native Linux Node/dotnet, so prefer containers for Linux verification.
- Research notes outside repo: `D:/Project/Git/.sbom-pilot-notes/compatibility.md` and `restore.md`. Key facts already captured in code/checkpoints; do not redo all research.
- No live Azure DevOps organization/server supplied: install/UI/real Artifact completion checks still unverified. Agent awaits queued artifact uploads and propagates upload failure; do not delete output or synchronously claim success.
- Optional publisher question had no answer yet: reference project has actual Publisher ID LawrenceShen, but do not infer consent from author name. Current developer VSIX uses explicitly local test publisher. No public repo URL exists; public packaging must not invent one.
- Full spec/public branding already approved: SBOM Pilot, sbom-pilot, Task display SBOM Pilot — Generate & Upload SBOM, MIT, Lawrence Shen, Traditional Chinese README plus developer guide. No further design interview is needed for those decisions.
