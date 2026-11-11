# 26: OSV 弱點顯示在執行結果的 Warnings／Errors

Type: task
Status: ready-for-agent
Blocked by: 25

## 規格

[OSV 失敗門檻 spec](../../osv-fail-threshold/spec.md)，使用者故事 12–20、38–39。

## 要建立的行為

每筆弱點以 Azure Pipelines issue 出現在執行結果頁的 Warnings／Errors 區塊：達到 OSV 失敗門檻者為 error，未達者為 warning（「僅警告」時全為 warning）。文字仿 NuGet NU1903，開發者不必開 log 或下載成品就知道要升級哪個套件。

## 驗收

- [ ] 每筆弱點輸出一則 `task.logissue`，內容含套件、版本、生態系、風險等級、OSV ID、CVE、修復版本與 OSV 連結；缺 CVE／修復版本時寫「未提供」。格式例：`OSV：套件 'Microsoft.Bcl.Memory' 9.0.4（NuGet）具有已知的 高 嚴重性弱點 GHSA-xxxx（CVE-xxxx），修復版本 9.0.5，https://osv.dev/GHSA-xxxx`。
- [ ] 達門檻為 error、未達為 warning；依風險由高至低排序。
- [ ] error 與 warning 各最多 50 則；超出時補一則同類型「另有 N 筆，詳見 OSV 弱點報告」。
- [ ] 外部字串中的換行、`;`、`]` 等會破壞 logging command 的字元已處理，不會截斷或注入指令。
- [ ] 沒有弱點時不輸出 OSV issue；移除原本的 `##[warning]` 單行 log。
- [ ] workflow 假服務測試斷言 log 中的 issue 指令類型、內容、排序、上限與溢出摘要。

## Comments

- 外部字串只出現在 `]` 之後的訊息資料區，依 Agent 規則只需跳脫 `%`、CR、LF；`;`、`]` 僅在屬性區需要跳脫，而本功能的屬性固定為 `type`。
