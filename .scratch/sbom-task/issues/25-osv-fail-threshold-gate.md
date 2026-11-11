# 25: OSV 失敗門檻：超過門檻擋 DT 並讓 Task 失敗

Type: task
Status: ready-for-agent
Blocked by: 24

## 規格

[OSV 失敗門檻 spec](../../osv-fail-threshold/spec.md)，使用者故事 1–11、21–34。

## 要建立的行為

使用者可在 Task 設定「OSV 失敗門檻」（危急、高、中、低、未知、僅警告，預設未知，只在啟用 OSV 時顯示）。任一弱點達到或高於門檻時，SBOM 不送往 DT 專案，仍發佈 SBOM 成品、OSV 弱點報告成品與 CI 摘要，最後 Task 失敗並說明門檻、各等級超標數量與已略過 DT 上傳。

## 驗收

- [ ] Task 新增 pickList 輸入（固定英文值 critical／high／medium／low／unknown／warnOnly，中文顯示），預設 unknown，visibleRule 為啟用 OSV；說明文字寫明等級界線與「無」「未知」的位置。
- [ ] 設定解析與驗證：只在啟用 OSV 時讀取；不合法值明確失敗；未啟用 OSV 時忽略。
- [ ] 等級排序 危急 > 高 > 中 > 低 > 無 > 未知；達到或高於門檻即超標；「低」不含「無」，「未知」含全部；「僅警告」永不超標。
- [ ] 超過門檻：不呼叫 DT 上傳並在 log 說明原因；SBOM 成品、OSV 弱點報告成品、CI 摘要照常發佈；拋出錯誤訊息如「OSV 弱點達到失敗門檻『高』：危急 1、高 3；已略過 DT 上傳。」
- [ ] OSV 技術失敗：門檻非「僅警告」時略過 DT；「僅警告」時照常上傳 DT；兩者皆讓 Task 失敗並保留有效 SBOM 成品。
- [ ] 只有未達門檻弱點：workflow 正常完成（Task Succeeded），DT 照常上傳。
- [ ] 未啟用 OSV：DT 與發佈不受影響。
- [ ] 門檻錯誤與 DT／成品／摘要錯誤同時發生時全部回報。
- [ ] 既有「發現弱點仍成功」的測試改為設定「僅警告」或斷言新行為；workflow 假服務與設定測試涵蓋上述案例。

## Comments
