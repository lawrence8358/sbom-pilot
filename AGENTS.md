## Agent skills

### Issue tracker

Issue 與規格以 Markdown 檔案存放在本 repo 的 `.scratch/` 底下。詳見 `docs/agents/issue-tracker.md`。

### Triage labels

使用預設的五個分類標籤（needs-triage、needs-info、ready-for-agent、ready-for-human、wontfix）。詳見 `docs/agents/triage-labels.md`。

### Domain docs

single-context：repo 根目錄一份 `CONTEXT.md`，加上 `docs/adr/`。詳見 `docs/agents/domain.md`。

### Implementation recovery

接續 SBOM Pilot 實作、重新派工或遇到額度／執行中斷時，先讀 `docs/agents/implementation-resume.md`，執行 `node scripts/resume.mjs`，再讀目標工單在其 worktree 內的 checkpoint；保留並接續既有 WIP。

完整 SBOM（工單 29–35）依使用者 2026-11-11 要求改為並行：同時最多三個 Codex 實作代理，只派 frontier 上互不阻擋的工單；每次派工前檢查 Codex 5 小時額度，超過 70% 即暫停新派工。合併由協調者依序執行，每次合併後核對驗證才更新 frontier。使用原需求的「.NET Core」，不要另創分類名稱。
