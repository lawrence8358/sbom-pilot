# 執行相容性與驗收

本頁區分本機／Docker 與真實 Azure 驗收。Marketplace 已發布 0.1.3，Azure DevOps Services Classic 的既有流程已完成真實執行與成品下載驗證。0.3.1 的雙份 SBOM、OSV 弱點報告與「OSV 弱點報告」頁籤以本機驗證為準，尚未在真實 Azure 驗收。Server 安裝、YAML UI、Agent 非同步上傳失敗、arm64 與企業網路條件仍 UNVERIFIED。

## Handler 與平台

同一 index.js 以 Node20 為 bundle 目標，提供 Node20_1／Node24、Build-only visibility、最低 Agent3.238.0。這是保守來源候選門檻，不保證特定 Server。Task 下載的掃描 Node24 與 Agent handler 分別管理；Classic Release 不適用。

| 組合 | 當前證據與狀態 |
| --- | --- |
| Windows 11 Pro x64／10.0.26200 build26200／Node20.20.2、24.22.1 | 審查修正後108/108測試；隔離 dist／實際 VSIX 入口、SDK 資源、秘密遮罩；Node20 入口完整 npm 流程及冷 Node24 下載；既有 pnpm、Yarn4 PnP、三種 Framework 格式、私有 .NET Core／combined矩陣，修正後重驗受影響 NuGet／Framework及DT失敗成品 |
| Linux x64／Ubuntu24.04.3 SDK10.0.101 容器 Node24.22.2 | 審查修正後fresh ci、108/108測試、型別／格式／170中文說明、建置／封裝／隔離入口；空Node工具快取下載及私有.NET Core掃描／同檔成品／DT失敗通過；本映像預裝SDK，不當作冷SDK下載證據 |
| Linux x64／Debian12 Docker Node24.22.2 | fresh ci/build/package、最終99/99測試；實際 VSIX 冷 Node 下載；未安裝 SDK 的 plain Node 映像以官方腳本安裝10.0.101，再私有 npm＋NuGet restore／combined掃描、DT接受同一成品；本機 adapter 故障 |
| Linux x64／Docker Node20.20.2 | 審查修正後108/108測試及實際 dist／VSIX 檢查；涵蓋SDK／網路／DT／UTF-8，既有 packaged npm 冷快取／有效成品及本機adapter故障證據保留 |
| Windows x64／.NET Core | 先前 SDK6.0.428／9.0.316／10.0.101 真實 restore及掃描；最終 VSIX10.0.101 私有來源驗收 |
| Windows x64／.NET Framework | MSBuild17.14.51；SDK net48、非 SDK PackageReference、packages.config；最終 VSIX 私有還原／依賴圖通過 |
| Windows/Linux x64／管理器與私有來源 | npm11.19.1、pnpm10.34.2／native12.16.1、Classic1.22.22、Yarn4.18.1 PnP/node-modules 完整先前矩陣；Linux 私有 npm/nativepnpm12/PnP/combined及 NuGet 真實矩陣見認證文件 |
| Azure DevOps Services Classic | 0.1.2：Ubuntu 24.04／Node24，.NET Core 方案單次還原，預設／自訂成品下載與 Schema 1.6 通過；[run2734](https://primeeagle.visualstudio.com/PrimeEagleX/_build/results?buildId=2734)、[run2735](https://primeeagle.visualstudio.com/PrimeEagleX/_build/results?buildId=2735)。YAML UI 與非同步失敗仍 UNVERIFIED |
| Server2022.2／Agent3.238.0 | Node20_1 來源候選，安裝／Classic/YAML／Windows/Linux 均 UNVERIFIED |
| Server2020.1.2／2019.1.2 官方 Agent3.225.0 | 低於 manifest 門檻，不列支援組合 |
| Windows/Linux arm64 | 下載程式設計目標，UNVERIFIED |
| Linux .NET Framework | 不適用；Framework 僅 Windows，需相應 MSBuild/workloads |

最終打包驗證使用真實 loopback npm/NuGet/DT，官方1.6 Schema、直接／間接依賴、鎖檔／來源設定、失敗與秘密檢查；DT403 仍要求發佈完全相同有效檔案再回報 Failed。artifact 故障是開發 preload 的 SDK adapter 拋錯；這不能代替真實 Agent 非同步上傳故障。Yarn 正常安裝可能格式化 manifest，鎖檔與來源設定仍要求位元組不變；required scope 的 chalk 例外見 [Yarn](yarn.md)。

套件／SBOM hash、實際命令及資源記錄於交付 checkpoint；可重跑命令見 [README-Dev](../README-Dev.md)。既有完整認證矩陣見 [npm](npm-auth.md)、[NuGet](nuget-auth.md)，共同根目錄規則見 [combined](combined.md)。沒有將先前 SDK 預裝映像當作冷 SDK 證據。

## Proxy、CA 與逾時

### OSV 掃描與版本快取

0.2.0 新增預設啟用的 OSV 掃描與 `sbom.cdx.json` 預設檔名。`runOsv: false` 可保留只產生 SBOM 的流程。`osvVersion: latest` 以 GitHub 網站 `/releases/latest` 轉址解析官方 Latest 穩定版，不呼叫有共用 IP 配額的 REST API；仍受 GitHub 網站流量限制。也可指定穩定精確版本。解析最多三次、每次30秒；binary 與 SHA256SUMS 下載固定到同一 tag，使用既有有界下載政策。

OSV 工具快取放在 `Agent.ToolsDirectory/sbom-pilot-osv/<version>/<platform>-<arch>`，完整快取先驗 SHA-256、版本及 CLI 後重用，無須下載。快取不包含弱點結果；掃描仍查詢當時 OSV 資料。持久 Agent 可跨執行重用；新建雲端 Agent 通常需重新下載。本次測試證據見工單21，不將歷史0.1.3的 Azure 成功視為新版已驗收。arm64 目前僅檔名選擇已測，實際硬體未驗證。

Node 下載沿用既有 Agent Proxy／CA／client certificate 支援；OSV 子程序取得標準 Proxy 及 SSL_CERT_FILE，掃描連線仍依 Go 工具本身能力，不能推定 Node 的 client certificate／regex bypass 會自動套用。需能存取 GitHub release 資產、api.osv.dev 與 OSV 掃描所需的外部服務。企業 Proxy／CA、Services／Server 真正成品上傳與失敗傳遞仍需對應環境驗收。

每次還原後產生並驗證產品 SBOM 與完整 SBOM，兩份皆發佈到同一個 Build Artifact。OSV 分別掃描兩份 SBOM，結束碼0／1各代表無弱點／有弱點，兩者都發佈報告。門檻只以完整 SBOM 判定，預設發現任一弱點即讓 Task 失敗並略過 DT 上傳；選「僅警告」時弱點只產生 warning issue 並照常嘗試 DT 上傳。各自的 JSON 掃描結果由官方群組最大 CVSS 分數與 CVE 別名產生 Markdown，無評分／CVE 時明示未知／未提供。報告以 `OSV弱點報告-產品.md`、`OSV弱點報告-完整.md` 發佈到相同 Build Artifact；另上傳結構化建置附件供「OSV 弱點報告」頁籤顯示。未啟用 OSV 時也會上傳標示未執行的附件。各項發佈獨立嘗試，保留檔案供 Agent 非同步讀取。

其他結束碼（包含127一般錯誤、128無套件、129 API錯誤）、逾時、缺少／空白／不相容 JSON 報告均使 Task 失敗，仍嘗試發佈有效 SBOM。OSV 技術失敗時，門檻不是「僅警告」即略過 DT 上傳；設定為「僅警告」時仍嘗試 DT 上傳。OSV／DT／成品／頁籤附件多重錯誤一併回報。

### 共用網路政策

工具下載與 DT 套用 Agent.ProxyUrl／Username／Password、regex bypass、CAInfo 與 client certificate；另遵循 HTTP_PROXY／HTTPS_PROXY／NO_PROXY。原生連線使用 CONNECT Proxy，認證只出現在 Proxy header，DT Key 只出現在目的服務 header，不放 CLI arguments 或錯誤文字。總請求逾時涵蓋 CONNECT 等待，回應有大小界限；DT TLS 略過只作用於 DT 目的連線，HTTPS Proxy 本身仍驗證憑證，沒有修改 NODE_TLS_REJECT_UNAUTHORIZED。

下載每個請求最多120秒、最多三次嘗試，每次最多五個 redirect，拒絕 HTTPS→HTTP 降級；每個回應上限256MiB。DT 每次30秒／最多三次，回應上限64KiB，完全不跟隨 redirect。

子工具取得 generic http_proxy／https_proxy（保留已存在值）、合併系統根憑證與 Agent CA 的 NODE_EXTRA_CA_CERTS，並在未指定時提供 SSL_CERT_FILE／CURL_CA_BUNDLE。不改寫 Repo 的 registry／feed 設定。Agent regex bypass 無法無損轉成各工具 NO_PROXY：使用者需在 Agent 提供等效 NO_PROXY；不會猜測並擴大繞過範圍。Client certificate 自動套用僅涵蓋原生連線，子工具依各自來源／憑證設定；Windows NuGet 仍需 Windows 信任存放區。企業網路完整流程、client certificate 的真實伺服器組合仍待驗證。這些限制不能靠全域略過 TLS 解決。

## 真實環境手動驗收

每個待驗證 Services／Server 組合各執行 Windows、Linux，分別使用 Classic Build 與 YAML；.NET Framework 的 Linux 列為不適用。先記錄 Server 年版／Update、Agent 完整版本、OS／架構、VSIX SHA-256、Task 版本、選用 handler、Node/cdxgen 實際版本。未知欄位保留 UNVERIFIED。

1. 執行 `npm ci`、`npm test`，依[上架說明](marketplace.md)設定實際Publisher／Repo，再執行 `npm run packaging:package -- --private`。用 `node scripts/verify-package.mjs --vsix packages/private/LawrenceShen.sbom-pilot-<version>.vsix` 檢查實際私有包。Windows 以 `Get-FileHash packages/private/LawrenceShen.sbom-pilot-<version>.vsix -Algorithm SHA256` 記錄套件；Linux 用 `sha256sum`。使用實際Publisher私有包分享到測試組織，placeholder預覽僅供本機檢查。
2. 在測試組織／Collection 擴充功能管理頁上傳同一個 VSIX 並安裝。記錄安裝結果及版本。Classic Build 搜尋 SBOM Pilot，確認 JavaScript／TypeScript、.NET Core、.NET Framework、.NET Core 前後端合併選項；DT 關閉時 DT 欄位隱藏，而 projectPath、excludes、specVersion 仍顯示；開啟時要求 URL／UUID／Key。Classic Release 不應列出本 Task。
3. 建立最小 Vue/npm 測試 Repo：package.json 含 `name:host-test-product`、`version:1.0.0`、`private:true`、dependencies.vue=`3.5.13`、devDependencies.chalk=`5.3.0`；main.js 內容 `import { createApp } from 'vue'; createApp({});`。在開發端執行 npm install 並提交 package.json、package-lock.json、main.js。Agent 保留必要 handler，但使用空的 SBOM Pilot 工具快取，讓單一 Task 自行準備掃描工具。
4. Classic Build 加一個 SBOM Pilot，JavaScript／TypeScript、Repo 根目錄、Node24.x、Spec1.6、DT關閉；不加 NodeTool／npm／cdxgen Task。YAML 使用下方相同值。確認工具實際版本、required-only、Schema 驗證及組件數；缺 lockfile／不同步各跑一次並確認失敗。

```yaml
trigger: none
pool:
  name: '<test-agent-pool>'
steps:
  - checkout: self
  - task: SbomPilot@0
    inputs:
      environment: javascript
      projectPath: '$(Build.SourcesDirectory)'
      nodeVersion: '24.x'
      specVersion: '1.6'
      uploadToDt: false
      fetchLicense: true
      noCache: true
```

5. 從 Build 結果下載 SBOM/sbom.cdx.json，以官方1.6 Schema 驗證。從 Agent.TempDirectory 的本次 `sbom-pilot-*/sbom/sbom.cdx.json` 計算 SHA-256，與下載檔案比對；Windows用Get-FileHash，Linux用sha256sum。確認 Vue 與依賴關係、記錄 chalk 的 required scope 結果；不得將 scope 結果宣稱為實際部署逐項核對。
6. 設定既有 DT UUID 及 Secret Pipeline Variable Key。成功時僅應記錄「已接受上傳」，不等待匯入。改用無效 Key／不可達測試端點再跑，Task 必須失敗，但有效成品仍可下載且 hash 一致。檢查 debug、成功與重試日誌沒有明文 Key／Proxy 密碼。
7. 在隔離的測試 Agent／Proxy 阻擋此次 Build Artifact 容器上傳請求（依 Agent diagnostics 確認其實際 URL），保留其他還原／工具來源可達，再跑原 Task。確認產生有效 SBOM 後 Agent 上傳失敗，最終步驟 Failed；測試時不可設定 continueOnError。另可用不存在檔案的 artifact.upload logging command 診斷 Agent，但此探針不能當作 SBOM Pilot 本身發佈失敗已驗收。
8. 企業情境另跑 authenticated Proxy、bypass、內部 CA、DT預設TLS／略過的矩陣。記錄具體憑證與 Proxy 類型但不保存秘密。完成後將實際結果／hash／版本填回驗證紀錄；沒有執行的列保持 UNVERIFIED。
9. 同一 VSIX 分別跑 npm、pnpm、Yarn Classic／4 PnP／node-modules、.NET Core 及共同根目錄 combined。Windows 另跑 Framework 三格式；Linux Framework 記不適用。使用已有鎖檔／SDK 宣告的測試 Repo，確認圖邊、required scope、設計目錄排除、一次成品、鎖檔不變；Yarn chalk 例外照實記錄。
10. 依 [npm](npm-auth.md)／[NuGet](nuget-auth.md) 建立 Secret Variables，在實際測試 feed 跑成功、缺少／錯誤認證與私有／公開來源並存；確認只有相符 install/restore 取得秘密，SDK debug、DT、成品和檔案都無秘密暫存。勿將公司 URL、Key 或完整環境日誌貼入公開紀錄。公司 feed 的結果不能從 loopback 測試推定。

每個 live 組合填一列：日期、Services/Server版本、Agent版本、OS/架構、handler、VSIX SHA-256、Classic/YAML、產品模式／來源、DT結果、下載 SBOM hash、上傳失敗結果。沒有執行時填 UNVERIFIED。公開交付前另記實際 Publisher ID、公開 Repo URL 及發布權限確認；測試佔位值不可當作真實身分。

Build Artifact 的 logging command 由 Agent 非同步處理；handler 的「已排入佇列」不是完成確認。[官方成品命令](https://learn.microsoft.com/en-us/azure/devops/pipelines/scripts/logging-commands?view=azure-devops#upload-upload-an-artifact) 與 [Agent StepsRunner](https://github.com/microsoft/azure-pipelines-agent/blob/v3.238.0/src/Agent.Worker/StepsRunner.cs) 支持此設計，實際下載與失敗結果仍需上述 live 驗證。


