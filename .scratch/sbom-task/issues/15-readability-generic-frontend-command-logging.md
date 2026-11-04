# 15: 邏輯分段、通用前端與實際命令日誌

Status: ready-for-agent
Blocked by: 14

**What to build:** 依使用者最新三項要求，在保留既有行為與認證保護下，加強人類可讀性、將前端定位擴展為通用套件管理器專案，並提供能核對實際執行內容的日誌。

## Acceptance criteria

- [x] src所有具名函式之間（含前置用途註解）保留空白行；函式內按準備／判斷／執行／驗證／清理等實際責任補空白行，不逐行灌空白、不改動字串／嵌入腳本語意。保留中文用途註解與Prettier可重跑檢查，增加必要的具名函式間距檢查。
- [x] 前端UI／文件／錯誤說明使用JavaScript／TypeScript專案，明列Vue、Angular等框架與npm／Yarn／pnpm。使用通用javascript值，既有vue輸入仍可執行相同流程，不依賴Vue套件或框架標記。保留原四種模式分流與combined語意。
- [x] Task實際執行每個工具子程序前，console記錄真正執行檔、完整參數及cwd；保留空參數／空白／引號／Unicode／glob與參數邊界，單行避免日誌控制字元注入，不因顯示而改用shell或更改實際argv。
- [x] 機密值以***遮罩，包括DT key、npm/NuGet密碼token、已知編碼／URL認證／認證旗標等。不得輸出整份環境變數或原始子程序stdout/stderr，不把秘密傳入新的CLI參數。FETCH_LICENSE／CDXGEN_NO_CACHE等非秘密掃描設定可明確記錄供核對。
- [x] DT原生HTTP上傳記錄真實方法／目的URL與遮罩API Key，不假造cdxgen上傳參數或shell命令；文件對照需求.md，說明cdxgen掃描與分開API上傳，日誌可直接核對required-only／spec-version／excludes／install-depsfalse。
- [x] 測試覆蓋實際runner日誌與遮罩、失敗／特殊字元、注入runner與原始Command不變、legacy vue／generic javascript、manifest／文件／解包VSIX。至少有真實非Vue Angular套件的npm／Yarn／pnpm代表性掃描證據，Windows/Linux皆有受影響封裝流程證據；不重跑無關.NET歷史矩陣。
- [x] 型別、格式、中文說明、間距檢查、完整測試及Node20/24封裝檢查通過；安全與功能複查、獨立merger整合後才結案。保存checkpoint供額度中斷接續。

## Comments

- 使用者明確要求函式及邏輯區塊空白行，前端不只Vue（例如Angular），實際command可見且API Key可遮罩；已重新讀取需求.md原始三組PowerShell／合併REST範例。這是既有實作的追加授權，不需重問需求。
- 保留無remote／不push／不PR、最多一位子代理、實作與合併分開。舊已解除註冊的五個目錄與診斷temp因清理錯誤／自動審查拒絕保留，與本工單無關，不得觸碰。

## Implementation

工單15已整合並獨立兩軸複查結案（2026-11-04）；安全修正8993b98，merge c19b354，證據與限制見 reviews/15-report.md / reviews/15-security-integration.md。保留live Azure與公開身分未驗收邊界。
