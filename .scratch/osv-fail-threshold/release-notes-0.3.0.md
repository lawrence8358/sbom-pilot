## SBOM Pilot v0.3.0

### 新增

- OSV 弱點可依危急、高、中、低或未知門檻決定是否讓 Pipeline Task 失敗。
- OSV 弱點以 Azure Pipelines Errors／Warnings 逐筆呈現，每類最多 50 則；完整清單保留於 OSV 報告。

### 行為變更

- 預設改為發現弱點即失敗並略過 DT 上傳；要維持 0.2.x 行為請選「僅警告」。
- OSV 技術失敗仍會讓 Task 失敗；門檻不是「僅警告」時略過 DT，上傳設定為「僅警告」時仍嘗試 DT。
- 有效 SBOM、已產生的 OSV 報告成品與 CI 摘要仍會嘗試發佈。

### 驗證

- typecheck、單元測試、格式、來源註解與 packaging 檢查結果記錄於工單 27 checkpoint。
- Azure DevOps 實際結果頁的 Errors／Warnings 呈現：待實機驗證。
