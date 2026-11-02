# 02: 使用者可設定掃描與工具選項

Status: ready-for-agent
Blocked by: 01

**What to build:** 使用者可在 Task 介面或 YAML 調整掃描及工具選項，並在實際產生的 SBOM 與執行紀錄中驗證效果。掃描設定保持可用，不因停用 DT 上傳而隱藏或失效。

## Acceptance criteria

- [ ] 串通專案路徑、共用排除規則、CycloneDX Spec Version、Node.js 版本、cdxgen 版本覆寫、授權補充及停用 cdxgen 快取選項；Classic Build 與 YAML 的設定語意一致。
- [ ] Node.js 預設最新符合 24.x 的版本，Spec Version 預設 1.6；cdxgen 預設隨 Task 發佈並驗證的固定版本。覆寫前檢查工具版本與 Node/CLI 相容性，遇到不支援組合時明確失敗。
- [ ] 排除規則以共同掃描根目錄為基準，接受逗號分隔並去除項目前後空白與空項目；花括號 glob 中的逗號不會被拆開，保留原需求中同時涵蓋兩個設計目錄的模式。
- [ ] 預填設計目錄、bin、obj、node_modules、dist 的共通排除 glob，允許修改整份規則；不把特定產品的測試目錄、文件或 SQL 目錄當作全域預設。
- [ ] 授權補充與停用 cdxgen 快取預設開啟，可各自關閉；兩個開關分別作用於授權資訊擷取及 cdxgen metadata cache，不誤變更套件來源或 Agent 工具快取。
- [ ] required-only 固定啟用；以固定工具版的代表性輸入驗證 required scope 篩選及排除效果，不把此結果宣稱為已逐項核對實際部署成品。
- [ ] 提供不同工具與掃描設定造成預期輸出差異的端到端驗證，涵蓋 glob 逗號、空白路徑及版本不相容案例；README 更新欄位、預設、相容限制及使用範例。

## Comments

- 使用者已核可本工單及其阻擋關係；輸出目錄與安裝位置仍由 Task 內部管理。
