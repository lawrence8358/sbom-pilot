# 12: 完整流程整合驗收與公開 VSIX 交付

Status: ready-for-agent
Blocked by: 07, 08, 09, 10, 11

**What to build:** 交付可供公開發佈的 SBOM Pilot VSIX 與完整正體中文使用文件，讓使用者依文件完成四種專案類型、私有來源及選擇性 DT 上傳的完整流程，維護者可重現建置、驗證、打包與發佈準備。

## Acceptance criteria

- [ ] 最終 VSIX 提供 .NET Framework、.NET Core、Vue、前後端合併四種模式；所有欄位、預設、條件顯示及工具版本行為符合已核可規格，名稱與識別在 UI、套件及文件中一致。
- [ ] 用最終打包產物整合驗收 npm、pnpm、Yarn、各 .NET 格式、合併產品及私有來源；驗證合併產品只有一份 SBOM，且仍可使用共同的 DT 上傳與成品發佈能力。
- [ ] 驗收關閉 DT、接受上傳、認證/連線/HTTP 失敗、TLS 選項、上傳失敗後成品仍可取得，以及成品發佈失敗；有效成品與上傳內容一致。
- [ ] 檢查工具版本鎖定、required scope、排除 glob、授權補充及 cdxgen 快取開關；必要回歸驗證覆蓋最終整合，而非僅彙整早期個別功能結果。
- [ ] 相容矩陣整合各專案類型、Services/Server、Classic Build/YAML 與 Windows/Linux 的實測證據；.NET Framework 限 Windows，未測、受限及不適用組合明確區分。
- [ ] 成功與失敗日誌皆不洩漏 API Key 或套件來源認證；最終 VSIX、SBOM 成品及公開範例不含認證暫存資料或內部公司專用資訊。
- [ ] 正體中文 README 涵蓋功能、支援範圍、前置條件、安裝、各模式快速開始、完整參數表、私有來源、成品下載、DT 接受上傳語意與疑難排解；使用者可依其完成一次完整執行。
- [ ] 開發文件可重現建置、必要測試、VSIX 打包、Extension/Task 版本管理及公開發佈準備；公開發佈資料包含版本說明、實際可用的 Publisher ID 與公開專案連結，不由作者名稱猜測帳號。
- [ ] 公開交付採 MIT 授權，含完整授權文字與 Lawrence Shen 作者資訊；產物、metadata、README 及 Marketplace 說明一致，符合 SBOM Pilot 與既定 Task 顯示名稱。

## Comments

- 使用者已核可本工單及其阻擋關係；本張包含公開發佈資料與流程準備，正式名稱、MIT 與最小 README 已由 01 起同步維護。
