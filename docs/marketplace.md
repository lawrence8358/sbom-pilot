# Marketplace 打包與更新

使用 Node.js >=24，先 npm ci。正式 Publisher 為 LawrenceShen，公開原始碼為 https://github.com/lawrence8358/sbom-pilot。

## 建立正式包

~~~powershell
$env:SBOM_PILOT_PUBLISHER = 'LawrenceShen'
$env:SBOM_PILOT_REPOSITORY_URL = 'https://github.com/lawrence8358/sbom-pilot'
npm run packaging:check
npm run packaging:package
~~~

輸出 packages/public/LawrenceShen.sbom-pilot-<version>.vsix，以及 packages/submission/public/ 下的獨立交付目錄，包含 VSIX、實際 manifest、listing、provenance 與 SHA256SUMS。交付資料不包含 GitHub 才使用的開發文件與範例。

以上指令只建立本機檔案，不上傳。私有包使用 packaging:package -- --private；本機 placeholder 預覽使用 packaging:preview，不能拿來更新正式 Publisher。packaging:submission 只接受與目前來源／dist／身分一致的既有包；來源或文件變更須重新 package。

README.md 同時用於 GitHub 與 Marketplace，所有圖片與文件以公開 GitHub HTTPS 絕對網址引用；先確保 main 上的目標內容可讀。VSIX 不需攜帶 hero、docs、examples 或 README-Dev。圖示仍由 manifest 指定且必須封裝，需正方形、至少128×128、最多1024 KB。

## 發布與驗證

1. 同步四處版本定義、測試、審查及正式打包。授權全文與 dist/licenses/manifest.json 由 build 依實際執行相依產生。
2. 將確認過的來源推到 GitHub main，核對 README 圖片與連結可公開讀取。
3. 登入 [Publishing Portal](https://marketplace.visualstudio.com/manage)，在 LawrenceShen 的 SBOM Pilot 選 Update，上傳該版正式 VSIX；等待驗證完成。
4. 確認市集版本後執行 Azure Build，核對 Task 實際版本、綠色階段日誌、成品上傳及下載後的 Schema。啟用 DT 時另驗證該環境的 API 接受。
5. 保存 VSIX SHA256 與實際執行連結；GitHub Release 記錄版本變更及驗證，不將本機測試當作 Server／企業網路驗收。

原始碼授權見 [LICENSE](../LICENSE) 與[第三方告示](../THIRD-PARTY-NOTICES.md)，使用條件見 [README](../README.md)，平台驗收見[相容性](compatibility.md)。

Microsoft 官方參考：[發布擴充功能](https://learn.microsoft.com/en-us/azure/devops/extend/publish/overview?view=azure-devops)、[manifest](https://learn.microsoft.com/en-us/azure/devops/extend/develop/manifest?view=azure-devops)。
