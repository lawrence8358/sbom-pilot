# SBOM Pilot implementation progress

Integration branch: `feature/sbom-pilot`
Initial specification commit: `e3a5bf6`

The user authorized implementation on a local branch, with no remote push or PR. Each implementer uses an isolated worktree and commits before integration. Ticket triage labels remain the configured five labels; implementation progress is tracked here separately.

| Ticket | Progress | Evidence |
| --- | --- | --- |
| 01 | Implemented; local verification passed | a543dc9 / merge f8abe50; 10 tests; build/dev VSIX; real Node24.22.2 + cdxgen13.6.0 Vue smoke, 23 components, lock unchanged |
| 02 | Implemented; local verification passed | c3bc8ad / merge 313200f; 15 tests; real options smoke 26 vs23 components; Ajv8.20; build/dev VSIX |
| 03 | Implemented; local verification passed | b7cc991 / merge e96721b; 26 integrated tests; real pnpm10 workspace/pnpm12 native/npm10 declared-version smokes |
| 04 | In progress | Isolated implementer worktree |
| 05 | Ready to merge | 293d5a5; real SDK6/9/10 and official SDK download smokes; dependency metadata exclusion fix |
| 06 | Waiting for 05 | |
| 07 | Waiting for 02, 03, 04, 05 | |
| 08 | Ready to merge | f5ca0d6; 25 branch tests incl real local HTTP/TLS, debug secret masking and failed-upload artifact preservation |
| 09 | Waiting for 03, 04 | |
| 10 | Waiting for 06 | |
| 11 | Waiting for 01 | Actual Services/Server installation needs live environments; source declarations alone are not proof |
| 12 | Waiting for 07, 08, 09, 10, 11 | Public metadata needs real identifiers; no remote URL has been supplied |

## Validation policy

Record commands and their actual outcomes. Local automated tests, local real-tool smoke runs, and live Azure DevOps or DT validation are distinct evidence. Do not mark live installation or platform checks as passed when those environments are unavailable.
