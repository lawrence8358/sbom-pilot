# 09: 私有 npm 來源支援三種套件管理器

Status: ready-for-agent
Blocked by: 03, 04

**What to build:** 使用者透過選填認證欄位及 Secret Pipeline Variables 提供私有 npm 來源資料後，npm、pnpm、Yarn 均能由同一 Task 完成認證、嚴格安裝、掃描與成品發佈。

## Acceptance criteria

- [ ] 明列認證欄位格式、來源對應及必填條件，Classic Build/YAML 語意一致；沿用 Repo 的 registry、scope 及其他安裝設定，不另建 Service Connection 類型，不要求額外 Authenticate Task。
- [ ] Task 明確將 Secret Pipeline Variables 傳入所需子程序或暫存認證設定，不假定機密變數自動出現在環境中，亦不把多個來源的認證誤套到不相關 registry。
- [ ] npm、所支援 pnpm 版本、Yarn Classic 與現代 Yarn 的認證各有代表性驗證；依工具實際規則處理設定，不能假定所有 pnpm 版本都會展開 Repo 認證設定中的變數。
- [ ] 保留原有版本宣告、workspace 及嚴格鎖檔政策；有效認證能實際取得私有測試套件，產生有效 SBOM 並發佈成品，不能只驗證欄位被讀取。
- [ ] 錯誤或缺少認證時回報來源與安裝階段，但不輸出 token/密碼；認證資料不寫回版本庫、不進入 SBOM 成品，暫存資料於成功或失敗後均清除。
- [ ] 驗證公開與私有來源並存、正確認證、認證失敗及清理行為；README 說明 Secret Variables 映射、欄位、版本限制與可操作範例。

## Comments

- 使用者已核可本工單及其阻擋關係；本張負責前端來源認證，NuGet 來源由 10 交付。
