# 完整 SBOM、雙份 OSV 弱點報告與「OSV 弱點報告」頁籤

Status: ready-for-agent

## Problem Statement

SBOM Pilot 以 cdxgen `--required-only` 產生 SBOM，排除開發套件，原意是讓 SBOM 只描述交付產品實際部署的內容。副作用是 OSV 只掃描這一份 SBOM，開發套件（建置工具、測試框架、dev server 等）即使有已知弱點，使用者也永遠不會知道。

另外，OSV 弱點報告目前以 Markdown 附在 CI 執行摘要的 Extensions 頁籤：

- 頁籤名稱固定為「Extensions」，區塊標題取自檔名 `sbom.osv`，使用者無法一眼認出。
- Markdown 表格沒有框線與內距，9 個欄位擠在一起難以辨識，Source 欄每列重複同樣內容。
- 無法篩選或排序。

`artifactName`、`sbomFileName` 在 Task 編輯器中帶著預設值，使用者不容易分辨哪些是自己設定、哪些是預設。

## Solution

- 每次執行在同一次依賴安裝後，以 cdxgen 產生兩份 SBOM：
  - **產品 SBOM**：沿用原參數，檔名為 `sbomFileName`。
  - **完整 SBOM**：同樣參數但不加 `--required-only`，檔名在最後的 `.json` 前加 `-full`。
  兩份都驗證並發佈到同一個 Build Artifact。
- 兩份 SBOM 都執行 OSV 掃描，兩份 OSV 弱點報告都發佈到成品：`OSV弱點報告-產品.md`、`OSV弱點報告-完整.md`。
- OSV 失敗門檻只以完整 SBOM 的 OSV 結果判定（見 ADR 0003）。
- 新增「DT 上傳版本」下拉選單，預設上傳完整 SBOM，可改為產品 SBOM。
- 不再上傳 Extensions 摘要。SBOM Pilot 擴充套件新增建置結果頁籤「OSV 弱點報告」，只在執行過 SBOM Pilot 的建置顯示。頁籤內容依序是判定行、總覽表，以及「產品 SBOM 弱點」「開發套件額外弱點」兩個區塊；表格有框線，可依等級篩選、依欄位排序。
- `artifactName`、`sbomFileName` 移除 Task 編輯器預設值，執行時未填仍保底為 `SBOM`、`sbom.cdx.json`。
- 兩張工單合併以 0.3.1 發佈。

## User Stories

1. As a pipeline 維護者, I want 每次執行都同時產生產品 SBOM 與完整 SBOM, so that 我既有交付內容的軟體組成清單，也能看到開發套件的弱點。
2. As a pipeline 維護者, I want 完整 SBOM 與產品 SBOM 共用同一次依賴安裝, so that 掃兩次只增加 cdxgen 掃描時間，不重複還原依賴。
3. As a pipeline 維護者, I want 產品 SBOM 的檔名就是 `sbomFileName`, so that 既有下游流程讀取的檔名不變。
4. As a pipeline 維護者, I want 完整 SBOM 的檔名是在 `sbomFileName` 最後的 `.json` 前加 `-full`（`sbom.cdx.json` → `sbom.cdx-full.json`、`PrimeX.json` → `PrimeX-full.json`）, so that 兩份檔名可以預期且並排顯示。
5. As a pipeline 維護者, I want 兩份 SBOM 都通過 CycloneDX 驗證，任一份產生或驗證失敗 Task 就失敗, so that 不會發佈不完整的組成清單。
6. As a pipeline 維護者, I want 兩份 SBOM 都發佈到同一個 Build Artifact, so that 下載一次就取得兩份。
7. As a pipeline 維護者, I want Task 編輯器中的「成品名稱」「SBOM 檔名」不再帶預設值，未填時執行仍使用 `SBOM`、`sbom.cdx.json`, so that 欄位顯示的就是我自己的設定，且既有管線不受影響。
8. As a pipeline 維護者, I want 「DT 上傳版本」下拉選單（完整 SBOM（含開發套件）／產品 SBOM），預設完整，只在勾選推送到 DT 時顯示, so that 我能選擇 DT 專案要追蹤哪一份。
9. As a YAML 管線作者, I want DT 上傳版本接受固定的英文選項值、拒絕不合法的值, so that 打錯字會在 Task 開始時明確失敗。
10. As a pipeline 維護者, I want 只上傳選定的那一份 SBOM 到 DT 專案, so that DT 專案不會收到兩份互相覆蓋的 BOM。
11. As a pipeline 維護者, I want 兩份 SBOM 都執行 OSV 掃描, so that 產品弱點與開發套件弱點都有報告。
12. As a pipeline 維護者, I want 兩份 OSV 弱點報告都發佈到成品，檔名為 `OSV弱點報告-產品.md`、`OSV弱點報告-完整.md`, so that 我能下載各自完整的報告。
13. As a pipeline 維護者, I want OSV 失敗門檻只以完整 SBOM 的 OSV 結果判定, so that 開發套件的弱點也會擋 DT 並讓 Task 失敗。
14. As a pipeline 維護者, I want 產品或完整 SBOM 任一份的 OSV 掃描技術失敗時，都依既有 OSV 失敗規則處理（門檻非「僅警告」時略過 DT 並讓 Task 失敗）, so that 無法確認安全性時不會推送。
15. As a 開發者, I want 執行結果頁 Warnings／Errors 的 OSV issue 依完整 SBOM 的弱點產生，開發套件額外的弱點在訊息中標示「開發套件」, so that issue 與門檻判定一致，又能分辨弱點來源。
16. As a 開發者, I want 建置結果頁有一個名為「OSV 弱點報告」的頁籤, so that 我不必在 Extensions 頁籤裡找報告。
17. As a 開發者, I want 這個頁籤只在執行過 SBOM Pilot 的建置上出現, so that 其他管線不會多出空頁籤。
18. As a 開發者, I want 頁籤最上方顯示判定（是否超過失敗門檻與門檻名稱）、報告產生時間（UTC+8）與 OSV Scanner 版本, so that 一眼知道這次建置的結論。
19. As a 開發者, I want 一張總覽表列出產品、開發套件額外、完整合計三列的受影響套件數、弱點數與各等級數量, so that 我能快速掌握規模。
20. As a 開發者, I want 「一、產品 SBOM 弱點」區塊列出產品 SBOM 的弱點, so that 我能優先處理會部署到正式環境的問題。
21. As a 開發者, I want 「二、開發套件額外弱點」區塊只列出完整 SBOM 有、產品 SBOM 沒有的弱點, so that 上下兩區不重複。
22. As a 開發者, I want 兩個區塊固定出現；沒有弱點時分別顯示「產品 SBOM 未發現已知弱點。」「開發套件無額外弱點。」, so that 不會誤以為某一份沒有掃描。
23. As a 開發者, I want 明細欄位為 等級、CVSS、套件（名稱與生態系兩行）、目前版本、建議升級、弱點編號、發佈日期、最後修改, so that 版面比原本的 9 欄好讀。
24. As a 開發者, I want 弱點編號欄把 CVE 與 GHSA／OSV ID 放在同一欄、各自連結, so that 不必在兩欄間對照。
25. As a 開發者, I want 沒有 CVE 時顯示「（無 CVE，僅 GHSA）」並保留 GHSA 連結, so that 不會誤以為沒有弱點或資料遺失。
26. As a 開發者, I want 發佈日期與最後修改取自 OSV 記錄的 `published`、`modified`，以 UTC 日期顯示，缺漏時顯示「未提供」, so that 我能判斷弱點的新舊與資料是否更新過。
27. As a 開發者, I want 表格有框線、內距，滑鼠移過整列標示, so that 欄位不再擠在一起。
28. As a 開發者, I want 頁籤顏色跟隨 Azure DevOps 的深色／淺色主題, so that 與平台一致且文字清楚。
29. As a 開發者, I want 依等級篩選（可多選切換、可一鍵全部顯示）, so that 我能只看關心的等級。
30. As a 開發者, I want 點欄位標題可排序等級、CVSS、套件、發佈日期、最後修改，預設依 CVSS 由高至低, so that 我能依需要重新排列。
31. As a 開發者, I want 頁籤中的中文、emoji 與符號都不出現亂碼, so that 報告可以直接閱讀。
32. As a 開發者, I want Task 日誌與結果訊息印出直達「OSV 弱點報告」頁籤的連結, so that 不必手動切換頁籤。
33. As a 開發者, I want 弱點資料中的套件名稱等外部字串都被安全顯示, so that 惡意的套件名稱不能在頁籤中注入 HTML 或腳本。
34. As a pipeline 維護者, I want 未啟用 OSV 時不產生 OSV 報告與頁籤資料、頁籤顯示「本次未執行 OSV 弱點掃描」, so that 頁籤出現時也不會誤導。
35. As a pipeline 維護者, I want Extensions 頁籤不再出現 OSV 報告, so that 同一份報告不會出現兩次。
36. As a 組織管理員, I want release notes 說明擴充套件新增讀取建置的權限，更新後需在組織設定重新同意, so that 更新不會停在舊版而沒人發現。
37. As a 升級中的既有使用者, I want README、Task 說明與 release notes 寫明「DT 預設改為完整 SBOM、開發套件弱點也會擋建置」，以及還原方式（DT 上傳版本選產品 SBOM；門檻依需求調整或選「僅警告」）, so that 升級後建置變紅時我知道原因。
38. As a 升級中的既有使用者, I want 版本為 0.3.1, so that 版本號照我們的發佈習慣只升小版號。
39. As a Azure DevOps Server 2022.2 使用者, I want 頁籤在 Azure DevOps Server 2022.2 與 Azure DevOps Services 都能使用, so that 雲端與地端行為一致。

## Implementation Decisions

- **詞彙**：使用 `CONTEXT.md` 的「產品 SBOM」「完整 SBOM」「OSV 弱點報告」「OSV 失敗門檻」「DT 專案」；不使用「正式 SBOM」「dev 版本」。分類名稱沿用原需求的「.NET Core」。
- **ADR**：DT 預設接收完整 SBOM、門檻以完整 SBOM 判定，記錄於 `docs/adr/0003-dt-defaults-to-full-sbom.md`。
- **Task 輸入**：
  - `artifactName`、`sbomFileName` 移除 `defaultValue`；`config.ts` 的執行時保底不變，說明文字改寫成「未填時使用 …」。
  - 新增 pickList（例如 `dtSbomVariant`），選項值 `full`／`product`，中文標籤「完整 SBOM（含開發套件）」「產品 SBOM」，預設 `full`，`visibleRule: uploadToDt = true`。只在啟用 DT 時讀取與驗證，不合法值明確失敗。
  - `runOsv` 說明文字改寫：兩份報告的成品檔名、結果頁籤，並刪除 Extensions 的描述。
- **檔名推導**：完整 SBOM 檔名 = 把 `sbomFileName` 結尾的 `.json`（不分大小寫）換成 `-full.json`。既有 `.json` 結尾驗證不變。推導後若與產品 SBOM 檔名相同（理論上不會發生）則明確失敗。
- **掃描**：依賴安裝只做一次；以同一組參數各呼叫一次 cdxgen 產生器，差別只在是否加 `--required-only`，輸出到同一暫存資料夾。掃描設定日誌改成列出兩份輸出與各自的 `requiredOnly`。cdxgen 能力檢查（`--required-only` 必須存在）不變。
- **驗證**：兩份分別以既有 validator 驗證，日誌各自寫出組件數。
- **OSV**：
  - 兩份 SBOM 各掃一次 OSV。同一次執行只解析並下載一次工具，兩次掃描共用。
  - 結果各自產生完整的 Markdown 報告與逐筆弱點清單；成品檔名固定為 `OSV弱點報告-產品.md`、`OSV弱點報告-完整.md`，以 UTF-8 寫出。
  - 逐筆弱點新增 `published`、`modified`，取自 OSV JSON 中匹配該群組的弱點記錄，多筆時取最早的 published 與最晚的 modified，輸出 UTC 日期 `YYYY-MM-DD`，缺漏時為空。
- **開發套件額外弱點**：完整 SBOM 的弱點中，扣除「生態系 + 套件名稱 + 版本 + 排序後的 OSV ID 集合」與產品 SBOM 某筆相同的項目。
- **門檻與 DT**：
  - `partitionOsvFindings` 與 issue 輸出改用完整 SBOM 的弱點清單；開發套件額外的弱點在 issue 訊息中標示「開發套件」。
  - 任一份 OSV 掃描技術失敗都加入錯誤清單，並依既有規則決定是否略過 DT。
  - DT 只上傳 `dtSbomVariant` 選定的那一份。
- **成品發佈**：同一個 Build Artifact 依序發佈產品 SBOM、完整 SBOM、`OSV弱點報告-產品.md`、`OSV弱點報告-完整.md`。既有規則不變：任一發佈失敗都加入錯誤清單，不吞掉其他錯誤。
- **頁籤資料**：
  - 移除 `tl.uploadSummary`。
  - Task 產生一份結構化報告 JSON，以 `tl.addAttachment` 上傳為建置附件，類型為自訂固定字串（例如 `sbom-pilot.osv-report`）。這份附件不是 Build Artifact，不出現在成品清單或任何頁籤。
  - JSON 帶 `schemaVersion`，內容包括：判定（是否超標、門檻）、報告產生時間（ISO 8601 含時區）、OSV Scanner 版本、兩份 SBOM 檔名、產品弱點清單、開發套件額外弱點清單、總覽統計，以及 OSV 是否執行或失敗的狀態。
  - 未啟用 OSV 時仍上傳一份只標示未執行的 JSON，讓頁籤顯示對應訊息。附件上傳失敗加入錯誤清單。
- **頁籤（擴充套件）**：
  - `vss-extension.json` 新增 `ms.vss-web.tab` 元件，目標為 `ms.vss-build-web.build-results-view`，名稱「OSV 弱點報告」，`supportsTasks` 指定 SBOM Pilot Task ID。
  - 新增 `scopes`：`vso.build`。
  - 前端使用 `azure-devops-extension-sdk` 與 `azure-devops-extension-api`，以 Build REST client 讀取本建置的自訂附件，再依 `schemaVersion` 呈現。不使用 React，小型 TypeScript 打包即可。
  - 所有外部字串以文字節點或跳脫後輸出，不使用未跳脫的 `innerHTML`；連結只允許 `https://osv.dev/`、`https://www.cve.org/`。
  - 顏色使用 Azure DevOps 主題變數，跟隨深色與淺色主題。
  - 版面以預覽 https://claude.ai/artifact/9CVRQ5fCGwx7teFMnwA3Lv 為準。
- **直達連結**：`${System.CollectionUri}${System.TeamProject}/_build/results?buildId=${Build.BuildId}&view=LawrenceShen.sbom-pilot.<tab contribution id>`，Team Project 名稱需 URL 編碼。印在日誌，並加到 Task 結果訊息。
- **版本**：Task 與擴充套件升為 0.3.1；README、README-Dev、task.json 說明、release notes 都要更新。

## Testing Decisions

- 好的測試只驗證外部行為：呼叫了哪些服務、帶什麼參數、發佈了哪些檔案、拋出什麼錯誤、輸出哪些 log／issue 指令、頁籤資料 JSON 的內容。不驗證內部呼叫順序。
- **主要切面：workflow 搭配假服務**（沿用現有 workflow 測試）。涵蓋：
  - 產生器被呼叫兩次，一次有 `--required-only`、一次沒有，輸出檔名正確，包括 `PrimeX.json`、大寫 `.JSON`。
  - 任一份產生或驗證失敗時 Task 失敗。
  - DT 依 `dtSbomVariant` 上傳對應的那一份，預設上傳完整 SBOM。
  - 門檻只依完整 SBOM 判定：只有開發套件弱點超標時也會擋 DT 並失敗。
  - 兩次 OSV 任一技術失敗時，依門檻決定是否略過 DT。
  - 4 個成品檔都發佈；附件上傳一次；不再呼叫 `uploadSummary`。
  - 未啟用 OSV 時只發佈兩份 SBOM，附件標示未執行。
  - 多個錯誤同時發生時全部回報。
- **次要切面：OSV 報告與差集**：用 OSV JSON fixture 驗證 `published`、`modified` 的擷取與缺漏處理，以及開發套件額外弱點的差集（同套件不同版本、同版本不同弱點都算額外）。
- **次要切面：設定**：`artifactName`、`sbomFileName` 未填時的保底；`dtSbomVariant` 的預設、合法值、不合法值，以及未啟用 DT 時忽略。
- **次要切面：頁籤呈現**：在 DOM 測試環境（例如 jsdom）餵入 JSON fixture，驗證：
  - 兩個區塊與空狀態文字。
  - 「（無 CVE，僅 GHSA）」。
  - 篩選與排序。
  - 惡意套件名稱不被當成 HTML。
  - 未知的 `schemaVersion` 顯示明確錯誤。
- **封裝測試**：task.json 輸入與預設值、vss-extension 的 tab 元件、scopes 與版本一致。
- **實機驗收**：在 primeeagle 以暫時管線實跑，確認：
  - 4 個成品檔，中文檔名下載解壓後正常。
  - 頁籤出現且只在 SBOM Pilot 建置出現，深色與淺色主題都正常、沒有亂碼。
  - 直達連結停在頁籤。
  - Extensions 不再有 OSV 報告。
  - 驗收完刪除暫時管線與分支。

## Out of Scope

- 頁籤的匯出、搜尋、跨建置比較。
- 弱點忽略清單或例外機制。
- 讓「OSV 弱點報告」成為建置結果頁的預設頁籤（平台不支援）。
- 同時上傳兩份 SBOM 到不同 DT 專案。
- 修改 OSV 工具下載、快取與版本解析。
- 成品中 Markdown 報告的排版：沿用現有報告格式，只改檔名與新增日期欄。

## Further Notes

- 2026-11-11 在 primeeagle 以暫時管線（建置 2750、2751，已刪除）驗證：
  - 中文成品檔名在 Ubuntu 與 Windows Agent 都正常；zip 內中文檔名帶 UTF-8 旗標，Windows 檔案總管解壓正常。
  - 中文附件標題與 Markdown 內容無亂碼。
  - `view=ms.vss-build-web.run-extensions-tab` 直達連結有效。
  - Extensions 摘要的 inline `style` 會保留，但使用者選擇改做自訂頁籤。
- 地端環境為 Azure DevOps Server 2022.2，支援建置結果頁籤擴充。
- 擴充套件新增 `vso.build` scope 後，組織管理員須重新同意，否則組織停留在舊版。
- .NET 專案中 `--required-only` 的影響可能很小，兩份 SBOM 幾乎相同屬正常。
- 工單：`.scratch/sbom-task/issues/` 的 29（完整 SBOM）→ 30（DT 上傳版本）、31（雙份 OSV 報告）→ 32（頁籤最小版）→ 33（總覽、篩選、排序、空狀態）→ 34（0.3.1 發佈與實機驗收）。依 AGENTS.md 序列執行，全部合併以 0.3.1 發佈。
