# 01: Vue/npm 單一 Task 產生並發佈 SBOM

Status: ready-for-agent
Blocked by: None (can start immediately)

**What to build:** 使用者安裝 SBOM Pilot Extension 後，只加入一個 Task，即可為使用公開 npm 來源的 Vue 交付產品準備工具、安裝依賴、產生 SBOM 並下載成品。這張工單交付可操作的最小 VSIX，包含正式命名、MIT 授權與初版使用文件。

## Acceptance criteria

- [ ] VSIX 可安裝並提供可執行的 Task；Extension 名稱為 SBOM Pilot，識別名稱為 sbom-pilot，Task 顯示名稱為 SBOM Pilot — Generate & Upload SBOM。
- [ ] 授權採 MIT，含完整授權文字與 Lawrence Shen 作者署名；套件及 Extension 的相關資訊一致。正式 Publisher ID 不由作者名稱推定，測試識別與公開發佈資訊可明確區分。
- [ ] 在具備必要 Agent runtime 與下載來源、但未預裝掃描工具的環境，自行準備最新符合 24.x 的 Node.js 及經實際驗證的固定 cdxgen 版本，記錄實際版本；不要求另加安裝工具的 Task，不依賴任意全域安裝版本。
- [ ] 依既有 npm lockfile 安裝公開依賴；缺少或不一致時清楚失敗，且不建立或更新 lockfile。掃描時不重複觸發 cdxgen 依賴安裝。
- [ ] 從指定專案根目錄產生啟用 required-only、符合 CycloneDX 1.6 的可解析且通過對應格式驗證的 JSON，記錄組件數；工具、安裝或掃描失敗均回報失敗階段。
- [ ] 未啟用 DT 時不要求 DT 連線或認證資料；有效 SBOM 直接發佈為名稱 SBOM 的 Build Artifact，輸出位置由 Task 管理，發佈失敗時 Task 失敗。
- [ ] 有實際公開 npm/Vue 範例的成功紀錄，以及 lockfile 缺失、安裝失敗、無效 SBOM 與成品發佈失敗的必要驗證；不能只以產出檔案存在判定成功。
- [ ] 正體中文 README 說明本階段實際可用功能、前置條件、安裝、最小 Classic Build/YAML 使用與成品取得；開發說明可重現建置、驗證及 VSIX 打包，範例使用中性名稱與佔位值。

## Comments

- 使用者已核可本工單及其阻擋關係；正式名稱、MIT 授權、作者與初版 README 均屬本張交付範圍。
