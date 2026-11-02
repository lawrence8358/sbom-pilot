# Coordinator recovery checkpoint

## Start here

Run `node scripts/resume.mjs` in the integration worktree, then read `implementation-state.json` and the target worker checkpoint in its own worktree. Git HEAD/status are authoritative when this summary is older. Resume existing work; no remote writes or PR.

## Persisted state

- Initial spec/ticket commit on main: `e3a5bf6`; code-review fixed point stays this commit.
- Integration branch: `feature/sbom-pilot` in `D:/Project/Git/sbom-pilot`.
- Ticket 01 code: `a543dc9`; merged by merger in `f8abe50`.
- Recovery workflow/dispatch manifest/read-only resume inspector: `caa7f3c`.
- Tickets 02/03/05/08 are now integrated. Latest combined verification:45 tests, build and developer VSIX passed at merge `bedcdf8`. Current HEAD and active leases must be read from Git and implementation-state.json.
- Ticket 04 Yarn is in progress in its retained worktree; it already has code and checkpoint commits. Ticket 06 Framework and ticket 11 compatibility/network are in progress in their own worktrees. Read their latest checkpoints before resuming.
- Workers were resumed after the user's explicit continue instruction. Agent IDs/conversations can be replaced; branches/worktrees/checkpoints retain the work.

## Validation already performed

- On baseline01: Windows `npm test` 10/10, build, developer VSIX packaging, cold real Node24.22.2/cdxgen13.6.0 Vue smoke passed. Vue present, dev-only chalk absent,23 schema-valid components, lockfile unchanged.
- Root merger independently ran npm ci/test/build successfully on integration.
- Root ran Linux Docker `node:24-bookworm` (digest `sha256:e7add2a490bb17d97b485b8641bd88455fff7839ade0f5eba493c3508124d413`): fresh npm ci,10/10 tests, build, cold real tool smoke all passed.23 components, same Vue/chalk and lock invariants. Container was removed normally. This is local Linux scan evidence, not a live Agent run.
- Production audit baseline had direct Ajv8.17.1 moderate (02 upgrades) plus task-lib/tool-lib transitive minimatch advisory with no compatible upstream fix. Do not blindly override minimatch to a breaking major; reassess audit on final lockfile.
-02 options smoke verified paths with spaces and26components without exclusions versus23 with both design directories excluded. Ajv upgraded to8.20.0.
-03 real Windows smoke verified pnpm10workspace, pnpm12native executable and declared npm10 installation. Valid git+https IRI references exposed a format-library bug; the committed validator preserves official schema and validates ASCII references correctly.
-05 real Windows SDK6/9/10 restore and scan, custom assets/lock paths, stale lock rejection and official SDK acquisition passed. Default obj exclusion must retain restore dependency metadata; this is implemented and must be preserved in07.
-08 real local HTTP/TLS tests, actual bundled debug secret ordering and artifact attempt after DT failure passed. This is not live DT or Azure verification.

## Remaining graph and integration

- Code integrated:01/02/03/05/08. Active worktrees:04/06/11.07 and09 follow04,10 follows06,12 follows07/09/10/11. The resume inspector recomputes the actual unassigned frontier from ticket edges and state.
- Once a worker has final commit, use a merger subagent to merge into integration. Root should not mutate integration simultaneously. Preserve all config/workflow/manifest behavior across parallel branches; resolve package-lock from merged package manifests and rerun checks if conflict requires regeneration.
-03 added generic JS installer dispatch and test discovery;05 added modern.NET dispatch;08 added conditional DT. Subsequent workflow/config/manifest edits must preserve all three. jsonc-parser needs its published ESM entry alias in both actual build and bundle tests to avoid a real UMD startup failure found during integration.
- After integration, update `integratedTickets` and active leases, progress/evidence, and recompute frontier. Save checkpoints before any new long-running task.
- Final Standards/Spec review has NOT started. Must run both against `e3a5bf6...HEAD`, fix findings in an isolated implementer worktree, verify and commit.

## Known environment / external gates

- Windows Node24.22.1/npm11.19.1; .NET SDKs6.0.428/9.0.316/10.0.101; VS2022 Enterprise MSBuild; Docker29.1.3 available. WSLUbuntu24.04 has no native Linux Node/dotnet, so prefer containers for Linux verification.
- Research notes outside repo: `D:/Project/Git/.sbom-pilot-notes/compatibility.md` and `restore.md`. Key facts already captured in code/checkpoints; do not redo all research.
- No live Azure DevOps organization/server supplied: install/UI/real Artifact completion checks still unverified. Agent awaits queued artifact uploads and propagates upload failure; do not delete output or synchronously claim success.
- Optional publisher question had no answer yet: reference project has actual Publisher ID LawrenceShen, but do not infer consent from author name. Current developer VSIX uses explicitly local test publisher. No public repo URL exists; public packaging must not invent one.
- Full spec/public branding already approved: SBOM Pilot, sbom-pilot, Task display SBOM Pilot — Generate & Upload SBOM, MIT, Lawrence Shen, Traditional Chinese README plus developer guide. No further design interview is needed for those decisions.
- Yarn workspace experiment found upstream cdxgen13.6 can mark a dev-only workspace dependency as required, so required-only retains it. Keep mandated scope behavior, record this concrete limitation and do not claim all non-production dependencies are guaranteed absent or silently invent a second filter.
