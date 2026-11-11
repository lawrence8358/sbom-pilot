# 27: 0.3.0 發佈與 OSV 行為變更說明

Type: task
Status: ready-for-agent
Blocked by: 25, 26

## 規格

[OSV 失敗門檻 spec](../../osv-fail-threshold/spec.md)，使用者故事 35–37。

## 要建立的行為

升級中的既有使用者能從版本號、README、Task 說明與 release notes 清楚得知：預設改為發現弱點即失敗並略過 DT 上傳；要維持 0.2.x 行為請選「僅警告」。

## 驗收

- [ ] Task 與擴充版本升為 0.3.0，版本一致性檢查通過。
- [ ] README（參數表與 OSV 段落）、task.json 中 runOsv 與新門檻的說明更新，移除「發現弱點只警告」的舊描述。
- [ ] 新增 0.3.0 release notes，標示行為變更、還原方式、Warnings／Errors 呈現與 DT 阻擋規則。
- [ ] 本機封裝與既有測試全數通過；未在真實 Azure DevOps 執行的項目標示未驗證。

## Comments
