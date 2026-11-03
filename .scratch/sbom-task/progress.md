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
| 13 | In progress | User-authorized readable README/Dev, Mermaid flow, Chinese function comments, consistent src TypeScript formatting and complexity refactoring |

## Validation policy

Record commands and their actual outcomes. Local automated tests, local real-tool smoke runs, and live Azure DevOps or DT validation are distinct evidence. Do not mark live installation or platform checks as passed when those environments are unavailable.

## Dispatch policy

User requested serial work after quota interruptions: at most one subagent (implementation, merge or review) at a time.13 is the sole active slice.01–12 are integrated and locally verified. Live Azure acceptance is still pending. Do not start the next slice until the current one is committed, integrated and verified. Unintegrated WIP is preserved and never counted as a completed ticket.
