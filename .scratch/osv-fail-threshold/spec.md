# OSV 失敗門檻、弱點 Issue 與 DT 阻擋

Status: ready-for-agent

## Problem Statement

SBOM Pilot 已預設執行 OSV 弱點掃描，但發現弱點時只在 log 印一行 `##[warning]`，Task 仍然成功，SBOM 照樣上傳到 DT 專案。使用者因此：

- 無法讓「有弱點」阻擋交付，帶有危急／高風險弱點的交付產品仍會被推到 DT 專案，看起來像通過檢查。
- 在執行結果頁的 Warnings／Errors 區塊看不到任何弱點，必須打開 log 或下載成品才知道；同一頁上 `dotnet build` 的 NU1903 弱點警告反而會出現。
- 無法依團隊風險政策決定「哪個等級以上才擋」，只能全有或全無。

## Solution

新增「OSV 失敗門檻」下拉選單（僅在啟用 OSV 掃描時顯示），選項為危急、高、中、低、未知、僅警告，預設「未知」（任何弱點都擋）。

- 每筆弱點都以 Azure Pipelines issue 呈現在執行結果的 Warnings／Errors 區塊：達到門檻的是 error，未達的是 warning。
- 任一弱點達到門檻時：不上傳 DT，但仍發佈 SBOM 成品、OSV 弱點報告成品及 CI 摘要，最後 Task 失敗並說明原因。
- OSV 本身失敗（工具、連線、報告產生）且門檻不是「僅警告」時，同樣不上傳 DT。
- 只有未達門檻的弱點時，Task 維持 Succeeded，弱點只出現在 Warnings。
- 選「僅警告」可完全維持 0.2.x 的行為（DT 照常上傳、弱點不讓 Task 失敗）。

## User Stories

1. As a pipeline 維護者, I want a「OSV 失敗門檻」下拉選單, so that 我能依團隊風險政策決定哪個等級的弱點要讓建置失敗。
2. As a pipeline 維護者, I want 門檻預設為「未知」, so that 新設定的管線在發現任何弱點時就會失敗，不必額外設定。
3. As a pipeline 維護者, I want 選「危急」時只有危急弱點才讓 Task 失敗, so that 我能先只擋最嚴重的風險。
4. As a pipeline 維護者, I want 選「高」時危急與高都會讓 Task 失敗, so that 等級比較是「達到或高於門檻」。
5. As a pipeline 維護者, I want 選「中」時危急、高、中都會失敗, so that 門檻語意一致。
6. As a pipeline 維護者, I want 選「低」時危急、高、中、低都會失敗、但 CVSS 為 0（無）與缺少評分（未知）不會, so that 我能排除沒有實際評分的項目。
7. As a pipeline 維護者, I want 選「未知」時任何弱點（含「無」與「未知」）都會失敗, so that 沒有評分的弱點不會漏網。
8. As a pipeline 維護者, I want 選「僅警告」時弱點永遠不讓 Task 失敗, so that 我能維持升級前的行為。
9. As a pipeline 維護者, I want 門檻選單只在勾選「執行 OSV 弱點掃描」時顯示, so that 未啟用 OSV 時不會被無關參數干擾。
10. As a pipeline 維護者, I want 未啟用 OSV 時忽略門檻設定, so that DT 上傳與成品發佈不受影響。
11. As a YAML 管線作者, I want 門檻輸入接受固定的選項值並拒絕不合法的值, so that 打錯字會在 Task 一開始明確失敗，而不是默默當成僅警告。
12. As a 開發者, I want 每筆弱點都出現在執行結果的 Warnings／Errors 區塊, so that 我不必打開 log 或下載成品就能看到弱點。
13. As a 開發者, I want 達到門檻的弱點顯示為 error、未達的顯示為 warning, so that 我一眼就分得出是哪幾筆讓建置失敗。
14. As a 開發者, I want 門檻為「僅警告」時所有弱點都顯示為 warning, so that 呈現方式與 Task 結果一致。
15. As a 開發者, I want 每則 issue 寫出套件、版本、生態系、風險等級、OSV ID、CVE、修復版本與 OSV 連結, so that 我能直接判斷要升級哪個套件到哪個版本。
16. As a 開發者, I want issue 文字格式類似 NuGet 的 NU1903 警告, so that 與既有建置警告的閱讀習慣一致。
17. As a 開發者, I want issue 依風險由高至低排序, so that 最嚴重的弱點最先看到。
18. As a 開發者, I want 缺少 CVE 或修復版本時 issue 明示「未提供」, so that 不會誤以為資料遺失是程式錯誤。
19. As a 開發者, I want error 與 warning 各最多顯示 50 則，超出時補一則「另有 N 筆，詳見 OSV 弱點報告」, so that 結果頁不會被上百則訊息洗版，也不會觸及 Agent 的 issue 數量上限。
20. As a 開發者, I want 超出上限時完整清單仍在 OSV 弱點報告中, so that 被省略的弱點不會遺失。
21. As a pipeline 維護者, I want 任一弱點達到門檻時不上傳 SBOM 到 DT 專案, so that 未通過檢查的交付產品不會出現在 DT 中。
22. As a pipeline 維護者, I want 超過門檻時仍發佈 SBOM 成品, so that 我能保留這次建置的軟體組成紀錄。
23. As a pipeline 維護者, I want 超過門檻時仍發佈 OSV 弱點報告成品, so that 我能下載完整報告進行修復。
24. As a pipeline 維護者, I want 超過門檻時仍把報告附到 CI 摘要（Extensions）, so that 不必下載就能查看完整報告。
25. As a pipeline 維護者, I want 超過門檻時 Task 結果為 Failed, so that 後續 Stage 與分支保護能正確擋下。
26. As a pipeline 維護者, I want 失敗訊息寫出門檻、各等級的超標數量與「已略過 DT 上傳」, so that 從結果頁就知道失敗原因與 DT 狀態。
27. As a pipeline 維護者, I want 超過門檻時 log 明確說明已略過 DT 上傳及原因, so that 排查時不會誤以為 DT 上傳失敗。
28. As a pipeline 維護者, I want 只有未達門檻的弱點時 Task 結果維持 Succeeded, so that 管線不會因 SucceededWithIssues 而改變後續 Stage 的條件判斷。
29. As a pipeline 維護者, I want 只有未達門檻的弱點時照常上傳 DT, so that 可接受的風險不會阻擋交付流程。
30. As a pipeline 維護者, I want OSV 技術失敗且門檻不是「僅警告」時不上傳 DT, so that 無法確認安全性的 SBOM 不會被推送。
31. As a pipeline 維護者, I want OSV 技術失敗且門檻為「僅警告」時照常上傳 DT, so that 選擇舊行為的管線完全不受影響。
32. As a pipeline 維護者, I want OSV 技術失敗時仍發佈有效的 SBOM 成品並讓 Task 失敗, so that 既有的失敗語意不變。
33. As a pipeline 維護者, I want DT 上傳本身的錯誤與門檻失敗同時發生時兩者都被回報, so that 任一錯誤都不會被吞掉。
34. As a pipeline 維護者, I want 成品或摘要發佈失敗時錯誤與門檻失敗一起回報, so that 多重失敗都看得到。
35. As a 升級中的既有使用者, I want README、Task 說明與 release notes 明確標示「預設改為發現弱點即失敗；要維持舊行為請選『僅警告』」, so that 升級後建置變紅時我知道原因與還原方式。
36. As a 升級中的既有使用者, I want 版本升到 0.3.0, so that 版本號反映這是行為變更。
37. As a pipeline 維護者, I want 門檻參數的說明文字寫清楚各等級的 CVSS 界線與「無」「未知」的位置, so that 我能正確選擇門檻。
38. As a 開發者, I want 沒有弱點時不產生任何 OSV issue, so that 乾淨的建置不會出現雜訊。
39. As a 開發者, I want 原本的 `##[warning]` 單行 log 被 issue 取代, so that 同一件事不會重複出現。

## Implementation Decisions

- **詞彙**：使用根目錄詞彙表中的「OSV 失敗門檻」「OSV 弱點報告」「DT 專案」「SBOM」。
- **等級排序**：危急 > 高 > 中 > 低 > 無 > 未知。界線沿用現有報告分級（危急 ≥9.0、高 ≥7.0、中 ≥4.0、低 >0、無 =0、缺少評分為未知）。弱點等級在門檻之上或等於門檻即為「達到門檻」。下拉選單不提供「無」；選「未知」包含「無」，選「低」不包含「無」。
- **Task 輸入**：新增 pickList 參數（例如 `osvFailOn`），選項值為英文固定字串（critical／high／medium／low／unknown／warnOnly），顯示中文標籤，預設 unknown，`visibleRule` 為啟用 OSV。設定解析與驗證只在啟用 OSV 時讀取並驗證；不合法的值拋出明確錯誤。
- **OSV 結果介面**：OSV 掃描結果除現有的路徑、版本、是否有弱點之外，新增逐筆弱點清單，每筆含風險等級、套件名稱、版本、生態系、OSV ID、CVE、修復版本。清單來源與 Markdown 報告為同一次解析，排序也與報告一致，確保 issue、門檻判定與報告不會不一致。
- **門檻判定**：一個純函式接受弱點清單與門檻，回傳達到門檻與未達門檻的兩組弱點。「僅警告」時達到門檻的一組永遠為空。
- **Issue 輸出**：在 workflow 的 OSV 階段之後，透過既有 log 串流輸出 `##vso[task.logissue type=error|warning]` 指令，不新增 issue 服務介面。每種類型最多 50 則，超出時補一則同類型摘要。訊息中的外部字串需處理換行與 `;`、`]` 等會破壞 logging command 的字元。移除原本的 `##[warning]` 單行 log。
- **DT 阻擋**：workflow 中 DT 上傳的前置條件改為「未超過門檻，且（OSV 成功或門檻為僅警告或未啟用 OSV）」。略過時 log 寫出原因。
- **發佈順序不變**：OSV 掃描 → DT 上傳（可能略過）→ SBOM 成品 → OSV 弱點報告成品 → CI 摘要。超過門檻不影響後三者。
- **錯誤彙整**：超過門檻產生一個錯誤加入既有的錯誤清單，訊息格式：「OSV 弱點達到失敗門檻『高』：危急 1、高 3；已略過 DT 上傳。」未啟用 DT 時，訊息不含「；已略過 DT 上傳」。與其他錯誤一起在最後拋出，Task 結果 Failed。
- **未達門檻**：只有 warning issue 時 workflow 正常完成，Task 結果 Succeeded。
- **CI 摘要區塊標題**：不變（使用者決定不處理）。
- **版本**：Task 與擴充升為 0.3.0；README、README-Dev（如適用）、task.json 說明、release notes 標示行為變更與還原方式。

## Testing Decisions

- 好的測試只驗證外部行為：哪些服務被呼叫、拋出的錯誤訊息、輸出的 log／issue 指令，不驗證內部函式呼叫順序或私有資料結構。
- **主要切面：workflow 搭配假服務**（沿用現有 OSV workflow 測試的寫法）。假的 OSV 掃描回傳帶等級的弱點清單，涵蓋：
  - 各門檻（含「無」「未知」邊界）下是否達到門檻；
  - 超過門檻時未呼叫 DT 上傳、三項發佈照常、錯誤訊息內容；
  - error／warning issue 的類型、內容、排序、50 則上限與溢出摘要；
  - 只有未達門檻弱點時正常完成且 DT 照常上傳；
  - OSV 技術失敗時依門檻決定是否略過 DT；
  - 未啟用 OSV 時 DT 不受影響；
  - DT 或發佈錯誤與門檻錯誤同時發生時都被回報。
- **次要切面：OSV 掃描與報告解析**（沿用現有 OSV 掃描與報告測試）：用 OSV JSON fixture 驗證回傳的弱點清單等級正確，含 CVSS 0 與缺少評分，並與 Markdown 報告列一致。
- **次要切面：設定解析與驗證**（沿用現有設定測試）：預設 unknown、接受所有合法值、拒絕不合法值、未啟用 OSV 時不讀取。
- 既有 OSV workflow 測試中斷言「發現弱點仍完成」的案例需改為明確設定「僅警告」或改斷言新行為。
- 封裝相關測試（task.json 輸入與版本一致性）需跟著更新。

## Out of Scope

- 自建「OSV 弱點報告」build results 頁籤或更改 Extensions 區塊標題。
- 依套件、ID 的弱點忽略清單或例外機制。
- 依弱點狀態把 Task 設為 SucceededWithIssues。
- 改變 OSV 工具下載、快取、版本解析或報告 Markdown 內容。
- 在 DT 端設定政策或等待 DT 分析結果。

## Further Notes

- `##vso[task.logissue]` 的 issue 會出現在執行摘要的 Warnings／Errors 區塊；`##[warning]` 只是 log 上色，不會產生 issue，這是原需求 3 的根因。
- Extensions 頁籤名稱由平台固定，摘要區塊標題預設取自檔名；本次不調整。
- 無法在本機驗證真實 Azure DevOps 結果頁的 issue 呈現，需在實際管線確認後才算雲端驗收。
