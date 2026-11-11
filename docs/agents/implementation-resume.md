# SBOM Pilot 實作續接

## 使用者最新要求：有限並行（2026-11-11）

完整 SBOM（工單 29–35）同時最多三個 Codex 實作代理，只派 frontier 上互不阻擋的工單；每次派工前檢查 Codex 5 小時額度（`~/.codex/sessions` 最新 `rate_limits.primary.used_percent`），超過 70% 即暫停新派工直到重置。Codex sandbox 不能 commit，由協調者提交並依序合併到整合分支，每次合併後核對驗證再重新計算 frontier。中斷後先核對 Git 和 checkpoint，不能把 WIP 或僅有測試計畫的工單標為完成。

用語使用原需求的「.NET Core」。未整合的舊分支在合併前也要核對用語，避免把已修正的文字帶回。

## 先恢復事實，再派工

1. 在整合工作區執行 `node scripts/resume.mjs`。它只讀取 Git、工單及派工資料，列出已整合、可派工及既有 worktree 的實際狀態。
2. 讀取目標工單、需求規格、根目錄詞彙表及相關 ADR。派工資料在 `.scratch/sbom-task/implementation-state.json`；整合與驗證摘要在同目錄的 `progress.md`。
3. 已有 worktree 的工單，先進入該 worktree，讀取該處的 `.scratch/sbom-task/checkpoints/NN.md`、Git log/status/diff。checkpoint 在尚未合併的分支內，不保證已出現在整合分支。
4. 依目前 commit、未提交變更、最近測試及 checkpoint 的下一步接續。代理的對話與暫時 agent ID 不作為續接依據；新的代理也使用相同工單與 worktree。
5. 完成並驗證後先提交，再由 merger 將工單分支整合到 `feature/sbom-pilot`。檢查所有驗證結果後更新派工資料及 progress，重新計算 frontier。

## 每個代理的 checkpoint

開始工作、遇到失敗、完成有意義的里程碑，以及交還工作前，更新工單 worktree 的 checkpoint，記錄：

- 工單、分支、worktree、基準 commit。
- 已完成的變更與仍未完成的驗收條件。
- 實際執行的驗證命令及結果；未執行的項目標示未驗證。
- 當前錯誤、最後的診斷與可直接執行的下一步。
- 尚在執行的命令、可續讀的 tool session ID／PID 與產物位置；續接時先確認程序是否仍在執行，再決定是否重跑。
- 與其他代理共用的介面或檔案，以及整合注意事項。

將有意義的 WIP 與 checkpoint 提交到工單分支，即使整張工單尚未完成，也清楚標示 WIP。若來不及提交，新的代理必須先檢查並保留現有變更。不要把 token、密碼、完整原始 log 或大型產物寫入 checkpoint。

## 本次邊界

- 使用者已授權完整實作、初始 commit 與本機分支；目前沒有遠端 Repo，不 push、不建立 PR。正式公開資料另依實際帳號與網址填寫。
- 初始規格 commit 是 review base；後續 root 的文件 commit 不是新的 review base。
- 本機單元測試、真實工具 smoke、Linux 容器測試、實際 Azure DevOps 驗證分開記錄。缺少真實 Services/Server 環境時，對應驗收仍未完成。
- 重新派工前先查已存在的分支與 worktree，不 reset、clean 或刪除既有 WIP，不重做已通過且未受新變更影響的驗證。
- 外部研究筆記位於派工資料指定的 notesDirectory，屬補充資料；續接的必要結論應保存在程式碼、checkpoint 或已提交的文件中。
- 目前可讀取的 Git/filesystem 是事實來源。額度或程序中斷後，先重新檢查，不假定舊代理仍在執行或舊測試仍代表當前 HEAD。

## 收尾

所有實作完成後，以初始規格 commit 為基準執行 Standards/Spec 雙軸 code review，修正並驗證發現的問題。只在工單工作已提交、整合且不需復原時，清理該工單 worktree。
