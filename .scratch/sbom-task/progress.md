# SBOM Pilot implementation progress

Integration branch: `feature/sbom-pilot`
Initial specification commit: `e3a5bf6`

The user authorized implementation on a local branch, with no remote push or PR. Each implementer uses an isolated worktree and commits before integration. Ticket triage labels remain the configured five labels; implementation progress is tracked here separately.

| Ticket | Progress | Evidence |
| --- | --- | --- |
| 01 | Implemented; local verification passed | a543dc9 / merge f8abe50; 10 tests; build/dev VSIX; real Node24.22.2 + cdxgen13.6.0 Vue smoke, 23 components, lock unchanged |
| 02 | Implemented; local verification passed | c3bc8ad / merge 313200f; 15 tests; real options smoke 26 vs23 components; Ajv8.20; build/dev VSIX |
| 03 | Implemented; local verification passed | b7cc991 / merge e96721b; 26 integrated tests; real pnpm10 workspace/pnpm12 native/npm10 declared-version smokes |
| 04 | Implemented; local verification passed | d9a9151 / merge 330425d; real Classic/PnP/node_modules smoke; 54 integrated tests, typecheck/build/dev VSIX passed; live Azure unverified |
| 05 | Implemented; local verification passed | 293d5a5 / merge bedcdf8; real SDK6/9/10 and official SDK download smokes; 45 integrated tests; dependency metadata exclusion fix |
| 06 | Implemented; local verification passed | a2d5c63 / merge ba15e11; 61 tests; real Windows SDK net48/non-SDK PackageReference/packages.config, Unicode paths, dependency edges and unchanged inputs; build/dev VSIX passed |
| 07 | Implemented; local verification passed | 99a359f / merge 972bb96; 76 tests; six Windows scenarios; Docker Ubuntu24.04 SDK10 real restore/combined30 components and standalone6; single scan/artifact, schema/edges/locks; build/devVSIX/test:package passed |
| 08 | Implemented; local verification passed | f5ca0d6 / merge dc92ec8; real local HTTP/TLS, debug secret masking and failed-upload artifact preservation |
| 09 | Implemented; local verification passed | bd1c483 / merge b79f7ca; 91 tests; Windows7/Linux4 real private auth cases, public isolation/edges/cleanup/locks; build/devVSIX/secret masking passed |
| 10 | Implemented; local verification passed | b5e8ee1 / merge 7f81211; 95 tests; Windows4 formats/Linux .NET Core real private/public feed auth, layered config/lock preservation, closure isolation, schema/edge/local artifact; Node20/24 package masks passed |
| 11 | Implemented; local verification passed; live acceptance pending | 5cc6c11 / merge 3e4d1aa; Windows/Linux 67 tests, isolated dist/VSIX on Node20/24; Proxy/CA and UTF-8 regression; live Azure unverified; upstream notice blocks public packaging |
| 12 | Implemented; local verification passed; external acceptance pending | b287e05 / merge 9debf04; 99 tests on Windows/Linux Node20/24, actual extracted VSIX matrix, cold Linux SDK, complete25 runtime notices, root devVSIX/test:package passed; real identities/live Azure external |
| 13 | Implemented; local verification passed | 4818116 / merge 8b6969d; human README/Dev+Mermaid,38 TS formatted,167/167 Chinese-purpose checks, responsibility refactors; Windows/Linux Node20/24 99tests and affected real flows; root package checks passed |
| 14 | Implemented; integrated; review closed | 30a2cae / merge c831001;108 tests and170 Chinese descriptions; Windows/Linux Node20/24, actual coldNode/privateNuGet/Framework passed; root package verified917afff; Standards3/Spec1 plus2 coordinator items fixed and independently rechecked; reviews/report.md |
| 15 | Implemented; integrated; review closed | Generic frontend + Angular npm/Yarn/pnpm Windows/Linux matrix, meaningful source spacing, safe actual command/HTTP diagnostics; security8993b98/mergec19b354; Windows20/24 full116, Linux24 targeted18,175 comments,spacing0,4 isolatedprobes; reviews/15-report.md |
| 16 | Implemented; integrated; review closed | finalb231a69 / mergef70fe2b; shared source roots+Bash docs; affected CLI integrity, Windows/Linux fresh preview and root new/legacy dualNode probes passed; historical116/175/spacing0 retained; Standards1 resolved, Spec0; reviews/16-report.md |

## Validation policy

Record commands and their actual outcomes. Local automated tests, local real-tool smoke runs, and live Azure DevOps or DT validation are distinct evidence. Do not mark live installation or platform checks as passed when those environments are unavailable.

## Dispatch policy

User requested serial work after quota interruptions: at most one subagent (implementation, merge or review) at a time.01–14 are integrated and locally verified. Initial reviews use fixed product8b6969d/basee3a5bf6; all findings were fixed, integrated and independently rechecked at product917afff. See reviews/report.md. Live Azure acceptance and public identities remain pending. Only clean, merged task worktrees may be cleaned up; branches and committed checkpoints remain available.

## 17 圖示大小修正（2026-11-06）
使用者同意後本機縮原圖至256×256／60,594 bytes；新增preflight與實際VSIX大小限制，精確邊界及真CLI全過。正式包與109個hash、Node20/24四組入口核對通過；runtime不變。詳見reviews/17-icon-size.md，最新產物見HANDOFF。未上傳市集。

## 18 .NET Core 專案路徑修正（2026-11-07）

`1bb265f`已整合於feature/sbom-pilot。0.1.1正式VSIX與109項SHA、119測試、新回歸雙Node、真packaging CLI、dist／VSIX雙Node入口通過。真實PortalBackend使用相對PrimeEagleX.Backend.sln執行封裝Task，還原、掃描、Schema成功，267組件。修正是.NET檔案轉所在目錄，保持既有遞迴／排除範圍並明示不依solution成員過濾。

使用者回覆後已上傳Marketplace0.1.1，驗證完成。原definition85設定、master78ef08f4與ubuntu-24.04啟動run2733成功，Task日誌版本0.1.1、Task1m58s／job2m3s。成品2170／SBOM/bom.json非同步上傳成功，實際下載550,201bytes、229組件、Schema1.6再次通過。工單18resolved。本機／Azure證據與交付位置見reviews/18-dotnet-project-file-path.md與HANDOFF。
