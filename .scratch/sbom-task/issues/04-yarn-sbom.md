# 04: Yarn 專案完成 SBOM 流程

Status: ready-for-agent
Blocked by: 01

**What to build:** 使用公開來源的 Yarn Classic 或現代 Yarn 交付產品，可由同一 Task 準備管理器、依既有鎖定資訊安裝、產生並發佈 SBOM。

## Acceptance criteria

- [ ] 依管理器宣告及鎖定資訊辨識 Yarn 與需採用的世代，不任意當成 npm 或 pnpm 專案執行。
- [ ] 優先遵循專案宣告的版本；缺少精確版本宣告時使用 Task 維護且驗證過的相容 fallback，記錄實際版本與選擇依據。
- [ ] Yarn Classic 與現代 Yarn 分別使用符合該版本的嚴格鎖檔安裝方式；缺少或不一致的鎖檔、管理器資訊衝突時明確失敗，不改寫鎖檔。
- [ ] 保留專案來源、workspace 與安裝設定，遵循所選版本的安裝腳本規則；SBOM 的 required scope 篩選與共同掃描契約一致。
- [ ] Yarn Classic 與現代 Yarn 各至少一個代表性專案完成還原、有效 SBOM 產生及成品發佈；workspace 及所支援安裝佈局的範圍須有明確驗證紀錄。
- [ ] README 提供版本辨識、支援佈局、前置條件、嚴格鎖檔失敗原因與使用範例；必要失敗案例可重現。

## Comments

- 使用者已核可本工單及其阻擋關係；私有來源認證另由 09 交付。
