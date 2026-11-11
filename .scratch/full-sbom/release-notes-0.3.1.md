# SBOM Pilot v0.3.1

### 新增

- Build 結果新增「OSV 弱點報告」頁籤，可在 Pipeline 執行結果中查看 OSV 弱點摘要與產品／開發套件分類。
- Build Artifact 新增完整 SBOM `sbom.cdx-full.json`，以及兩份中文檔名 OSV 報告：`OSV弱點報告-產品.md`、`OSV弱點報告-完整.md`。
- 擴充套件新增 `vso.build` 權限，供報告頁籤讀取建置附件。組織管理員需更新擴充套件，並重新同意授權。

### 行為變更

- Dependency-Track（DT）預設改為上傳完整 SBOM，包含開發套件。要還原先前只上傳產品 SBOM 的設定，請在 DT 上傳版本選擇「產品 SBOM」。
- 開發套件弱點也依 OSV 失敗門檻阻擋建置。要還原不因開發套件弱點阻擋的行為，可調整失敗門檻，或選擇「僅警告」。
- 移除 CI Extensions 摘要，改由建置結果中的「OSV 弱點報告」頁籤查看報告。

### 版本

- Task 與 Azure DevOps 擴充套件版本升為 `0.3.1`。

### 驗證

- 本機驗證命令與結果記錄於工單 34 checkpoint；Azure DevOps／Dependency-Track 實機驗收由協調者另行處理。
