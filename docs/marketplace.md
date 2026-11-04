# Marketplace 包裝與上架

本流程準備 Azure DevOps Marketplace 的本機交付資料。所有 `packaging:*` 命令都不連線上傳、不分享組織、不公開擴充功能。實際 Publisher ID／公開 Repo URL 尚未提供；先用 placeholder 預覽即可完成版面與內容檢查。

## 工具準備與檢查

使用 Node >=24 與 npm。Linux 另需 `file` 指令。以下命令使用 package-lock 的本機 tfx-cli0.24.2，安裝整組鎖定開發相依，不需要全域 tfx：

```powershell
npm run packaging:install-tool
npm run packaging:check -- --preview
npm run packaging:preview
```

已有完整 npm cache 時，安裝可加 `-- --offline`；一般命令沿用 npm 來源設定。一次性PNG及生成紀錄已在 [images](../images/README.md)，build不呼叫AI。`packaging:check` 核對版本、鎖定工具、PNG尺寸與overview；預設還要求正式身分。正式runtime授權告示在build後、建立VSIX前再次檢查。

## 預覽與正式包

| 命令 | 輸出與用途 |
| --- | --- |
| `npm run packaging:preview` | 完成check、build、私有placeholder VSIX、`packages/submission/preview/`交付資料；名稱含Local Development Preview，不能正式上架 |
| `npm run packaging:check` | 檢查正式身分與來源素材；不建置或上傳 |
| `npm run packaging:package -- --private` | 用實際Publisher建置私有測試包與`packages/submission/private/` |
| `npm run packaging:package` | 用實際Publisher建置`public:true`包與`packages/submission/public/`；不代表已公開或通過審核 |
| `npm run packaging:submission -- --private` | 重新驗證並整理目前匹配的正式私有包；不build、不接受placeholder |
| `npm run packaging:submission` | 同上，要求正式public包 |

正式命令使用已確認的實際資料：

```powershell
$env:SBOM_PILOT_PUBLISHER = '<actual-publisher-id>'
$env:SBOM_PILOT_REPOSITORY_URL = 'https://<public-repository-url>'
npm run packaging:check
npm run packaging:package -- --private
```

佔位文字須替換才可通過。Repo必須是無帳密、無query／fragment的公開HTTPS URL；程式檢查語法與佔位值，維護者仍須確認實際公開性及Publisher操作權限。不要把帳號、token或PAT寫入manifest。預覽不借用其他專案的Publisher。

新流程的VSIX按模式存於 `packages/preview/`、`packages/private/`、`packages/public/`，正式檔名為 `<publisher>.sbom-pilot-<version>.vsix`。每次交付資料另建立獨立目錄，console顯示完整路徑，內含：

- 本次VSIX、`listing.json`、有效的 `vss-extension.json`、實際generated manifests。
- `marketplace/overview.md`、icon／hero／生成紀錄，以及保持相對結構的README、Dev、docs、examples與runtime授權。
- 本操作文件、MIT LICENSE、第三方告示、`provenance.json`及 `SHA256SUMS`。

`SHA256SUMS`列出除自身外所有交付檔案的SHA-256；Linux可在該目錄用 `sha256sum -c SHA256SUMS`。Windows可用 `Get-FileHash <file> -Algorithm SHA256` 核對相應行。圖片是插畫，不填成虛構UI screenshot。

建置收據把來源、scripts、tests、鎖檔、manifest、文件、素材與dist位元組綁定；包裝收據另保存模式／身分與整個VSIX雜湊，並核對實際archive內容及文件連結。任何輸入新增、刪除、更動、舊build配新文件、VSIX竄改或private/public不符，都必須重新 `packaging:package`。這是本機完整性／新鮮度檢查，不是簽章或可信建置證明；保護本機收據及工作目錄仍是維護者責任。

相容命令 `npm run package:dev`／`npm run package:release`仍build並把VSIX放在 `packages/`根目錄，供既有測試流程使用；`npm run package:release -- --private`不會把參數轉入內層package script，實際Publisher私有測試請使用新的 `packaging:package -- --private`，或build後直接 `node scripts/package.mjs --private`。舊命令不建立submission。`npm run test:package`預設驗證舊路徑；新包可用 `node scripts/verify-package.mjs --vsix <path> --node <absolute-node-path>`。

## 在portal私有上傳與測試

先登入 [Marketplace Publishing Portal](https://marketplace.visualstudio.com/manage)，選擇有權限的Publisher，確認其ID與正式私有包的 `listing.json`／manifest一致。依[官方包裝與發佈說明](https://learn.microsoft.com/en-us/azure/devops/extend/publish/overview?view=azure-devops)，選 **New extension → Azure DevOps**，上傳交付資料中的VSIX。placeholder預覽只供本機檢視；不拿它取代實際Publisher私有包。

在擴充功能選單用 **Share/Unshare** 加入測試組織。由該組織開啟Marketplace頁面，選 **Get it free → Install**，再到 Organization settings → Extensions 確認。若是Azure DevOps Server，依所用Server年版與管理介面完成其本機安裝程序；不要以Services流程當作所有Server已驗收。

使用 [live驗收清單](compatibility.md)記錄實際Server／Agent／OS／handler／VSIX hash，測Classic Build與YAML四模式、秘密欄位、SBOM下載、DT失敗後同檔成品及Agent非同步上傳故障。這些目前仍 **UNVERIFIED**；本機package或Docker成功不代替真正Azure驗收。

## 公開與後續改版

私有測試及外部門檻完成後，再取得維護者公開授權。`packaging:package`以實際身分產生 `public:true`；portal管理者核對公開Repo、overview、圖片權利、MIT及第三方授權後手動上傳／公開。Publisher資格與Marketplace審核依Microsoft當時要求，工具不保證審核結果。[manifest參考](https://learn.microsoft.com/en-us/azure/devops/extend/develop/manifest?view=azure-devops)說明icon、content.details與public flag。

每次更新同步增加 `package.json`、`package-lock.json`根與root package版本、`src/task.json`、`vss-extension.json`，更新CHANGELOG，再跑完整測試、獨立審查與正式包裝。保留Task GUID與名稱；Task major決定YAML的 `SbomPilot@0`等版本參照。在portal對既有擴充功能選 **Update**上傳新VSIX，避免刪除後重建；先驗證私有測試，再更新公開版。保留本次交付資料與Azure測試證據。
