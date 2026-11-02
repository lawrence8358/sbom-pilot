# Coordinator recovery checkpoint

## Start here

Run `node scripts/resume.mjs` in the integration worktree, then read `implementation-state.json` and the target worker checkpoint in its own worktree. Git HEAD/status are authoritative when this summary is older. Resume existing work; no remote writes or PR.

## Persisted state

- Initial spec/ticket commit on main: `e3a5bf6`; code-review fixed point stays this commit.
- Integration branch: `feature/sbom-pilot` in `D:/Project/Git/sbom-pilot`.
- Ticket 01 code: `a543dc9`; merged by merger in `f8abe50`.
- Recovery workflow/dispatch manifest/read-only resume inspector: `caa7f3c`.
- Tickets 01/02/03/04/05/06/08/11 are integrated. Latest combined verification: npm ci, typecheck and67tests passed at `3e4d1aa`; product tree is identical to ticket11's verified Windows/Linux dist/VSIX at `5cc6c11`. Current HEAD and active leases must be read from Git and implementation-state.json.
- Serial execution is the user's latest direction: at most one subagent, including implementation, merge and review. Finish verified integration before starting another ticket.
- Ticket 04 Yarn is integrated in `330425d`: typecheck, 54 tests, build and developer VSIX passed. Its real Classic/PnP/node_modules workspace smoke passed before interruption; recovered process exit0 and final evidence are in checkpoint04. No need to repeat unchanged smoke.
- Ticket 06 Framework is integrated at `ba15e11`; typecheck and61tests passed after conflict-free merge. Real Windows three-format/Unicode/edge smoke and build/devVSIX passed on the identical product tree at `a2d5c63`.
- Ticket 11 integrated at `3e4d1aa`: Windows/Linux Node24 67 tests and packaged dist/VSIX checks passed; Node20 shipped checks and16network/DT/process tests passed. UTF-8 split-chunk fix included. Own checkpoint11 records exact images, results and retained Docker volume.
- Ticket07 is the sole active slice, new isolated worktree `../.sbom-pilot-worktrees/07-combined`, branch `ticket/07-combined`. Follow original common-root pnpm workspace plus .NET sample: one recursive dotnet/js scan, one SBOM; add real Linux .NET Core/combined smoke with local Docker.09/10 remain queued.
- Latest user asked how Linux was tested and explicitly offered Docker. Explained that their local Docker is already used for Node20/24 bookworm container checks, not a real Azure Agent. Linux .NET restore/scan and final combined product smoke still need verification in subsequent tickets.
- Attribution inventory is complete, but upstream nodejs-file-downloader4.13.0 has ISC metadata without full notice. Public packaging is deliberately gated; inspect checkpoint11/notices before final release work. Do not invent copyright/license text.
- Agent IDs/conversations can be replaced; branches/worktrees/checkpoints retain the work. Product terminology follows the original requirement: .NET Core.

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

- Code integrated:01/02/03/04/05/06/08/11. Sole active ticket:07.09/10 are ready but queued;12 follows07/09/10/11. The resume inspector recomputes the actual unassigned frontier from ticket edges and state.
- Once a worker has a final commit, run the merger as the sole subagent. Root should not mutate integration simultaneously. Preserve all config/workflow/manifest behavior, terminology corrections and serial dispatch policy across retained branches; resolve package-lock from merged package manifests and rerun checks if conflict requires regeneration.
-03 added generic JS installer dispatch and test discovery;05 added .NET Core dispatch;08 added conditional DT. Subsequent workflow/config/manifest edits must preserve all three. jsonc-parser needs its published ESM entry alias in both actual build and bundle tests to avoid a real UMD startup failure found during integration.
- After integration, update `integratedTickets` and active leases, progress/evidence, and recompute frontier. Save checkpoints before any new long-running task.
- Final Standards/Spec review has NOT started. Must run both against `e3a5bf6...HEAD`, fix findings in an isolated implementer worktree, verify and commit.

## Known environment / external gates

- Windows Node24.22.1/npm11.19.1; .NET SDKs6.0.428/9.0.316/10.0.101; VS2022 Enterprise MSBuild; Docker29.1.3 available. WSLUbuntu24.04 has no native Linux Node/dotnet, so prefer containers for Linux verification.
- Research notes outside repo: `D:/Project/Git/.sbom-pilot-notes/compatibility.md` and `restore.md`. Key facts already captured in code/checkpoints; do not redo all research.
- No live Azure DevOps organization/server supplied: install/UI/real Artifact completion checks still unverified. Agent awaits queued artifact uploads and propagates upload failure; do not delete output or synchronously claim success.
- Optional publisher question had no answer yet: reference project has actual Publisher ID LawrenceShen, but do not infer consent from author name. Current developer VSIX uses explicitly local test publisher. No public repo URL exists; public packaging must not invent one.
- Full spec/public branding already approved: SBOM Pilot, sbom-pilot, Task display SBOM Pilot — Generate & Upload SBOM, MIT, Lawrence Shen, Traditional Chinese README plus developer guide. No further design interview is needed for those decisions.
- Yarn workspace experiment found upstream cdxgen13.6 can mark a dev-only workspace dependency as required, so required-only retains it. Keep mandated scope behavior, record this concrete limitation and do not claim all non-production dependencies are guaranteed absent or silently invent a second filter.
