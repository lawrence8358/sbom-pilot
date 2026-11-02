# 私有 NuGet 認證

.NET Core、Windows .NET Framework 及 combined 模式可在同一 Task 使用公開／私有 NuGet 來源。先在專案的既有 NuGet.Config 宣告來源；在 Pipeline Variables 建立 **Secret** 變數 `nugetCredentials`，值為 JSON 清單：

```json
[
  {
    "source": "Private",
    "url": "https://packages.example.test/nuget/v3/index.json",
    "username": "build-user",
    "password": "PAT-or-password"
  }
]
```

`source` 必須與有效 packageSources 名稱大小寫完全一致，限英數字、點、底線、連字號（最多128字）。`url` 是完整來源 URL，保留路徑及大小寫，不是 host 或下載 tarball URL；不可含 userinfo、query 或 fragment。`username`／`password` 必須非空，不可含分號、換行、NUL 或前後空白；username 另不可含冒號。清單最多20筆，每個來源名稱只能有一組 Task 認證；大小寫不同的重複名稱也會拒絕。PAT 放在 password，username 依來源服務要求填寫。支援 NuGet 的 Basic username/password 認證，包含要求 Basic 的 PAT；互動登入、NTLM／Negotiate、client certificate 認證不由此欄位設定。

```yaml
steps:
- task: SbomPilot@0
  inputs:
    environment: dotnet # Windows Framework 使用 netframework；前後端使用 combined
    projectPath: '$(Build.SourcesDirectory)'
    nugetCredentials: '$(nugetCredentials)'
    uploadToDt: false
```

Classic Build 在「進階設定／私有 NuGet 來源認證」填 `$(nugetCredentials)`。只填秘密變數參照，不把實際 JSON 寫入 YAML。無需 Service Connection、Authenticate Task、外部 UseDotNet 或另一個 restore Task。Vue-only 不使用這組認證；combined 的 JavaScript 部分另用 `npmCredentials`，兩者不混用。

## 來源解析及隔離

Task 先讓實際 SDK／MSBuild 產生 NuGet restore graph，再以 graph 中每個專案的 `configFilePaths`，呼叫該還原工具隨附的 `NuGet.Configuration.Settings.LoadSettingsGivenConfigPaths` 及 `PackageSourceProvider.LoadPackageSources`。不猜測 machine/user/repo 設定階層，也不把使用者的來源設定複製到新的全域 NuGet.Config。原有 `<clear/>`、環境展開、disabledPackageSources、repositoryPath、packageSourceMapping、RestoreSources、SDK 政策、Proxy 及鎖檔繼續由 NuGet／MSBuild 處理。可參閱官方[設定優先序](https://learn.microsoft.com/en-us/nuget/consume-packages/configuring-nuget-behavior)、[NuGet.Config](https://learn.microsoft.com/en-us/nuget/reference/nuget-config-file)及[來源映射](https://learn.microsoft.com/en-us/nuget/consume-packages/package-source-mapping)。解析 API 及環境認證規則以 [NuGet 官方實作](https://github.com/NuGet/NuGet.Client/blob/dev/src/NuGet.Core/NuGet.Configuration/PackageSource/PackageSourceProvider.cs)為準，執行時使用 Agent 實際工具版本的組件。

認證經由官方 `NuGetPackageSourceCredentials_<source>` 子程序環境變數傳入，值包含 `ValidAuthenticationTypes=Basic`，優先於設定檔密碼，不依賴原帳號／電腦才可解密的密碼。Task 不解密、複製或改寫既有密碼。依據官方[私有來源認證](https://learn.microsoft.com/en-us/nuget/consume-packages/consuming-packages-authenticated-feeds)規則。

由於官方環境認證只以名稱索引，Task 在任何密碼進入 restore 前，會驗證**整個 ProjectReference 還原範圍**：若任一有效啟用來源與 Task 提供的同名來源 URL／大小寫不同，立即拒絕。即使該來源被 RestoreSources 覆蓋而暫未使用，也保守拒絕此衝突。支援 auditSources 的工具亦檢查同名 audit 來源。停用來源不啟用、不提供 Task 認證；其他公開來源不取得 Task 認證。不在此獨立還原範圍內的清單項目可供後續專案使用；實際來源必須出現在 graph 才注入認證（audit 來源依有效 audit 設定）。沒有可安全對應的 graph 設定路徑／來源則停止。需要同名異址的產品請先使用不同 NuGet 來源名稱，不能透過此欄位繞過隔離。

## 各格式及生命週期

SDK-style .NET Core／Framework 使用已選 SDK 的 dotnet restore；Windows 非 SDK-style PackageReference／packages.config 使用 Agent 預裝 MSBuild17.8以上及其 NuGet Restore。傳統 Visual Studio workloads、Framework targeting pack、系統 CA 信任仍由 Agent 提供；不安裝整套 Visual Studio。SDK graph／settings 評估須在傳入專案秘密前完成，因此會在 MSBuild 評估階段就需要私有自訂 SDK／targets 認證的專案不由此機制處理，應先提供相容且可評估的 Agent／SDK。

SDK 的來源解析 helper 以該 SDK 隨附 NuGet 組件離線編譯，沒有外部 NuGet 套件；Windows 傳統格式使用該 MSBuild 的 NuGet 組件。helper 僅讀設定路徑及輸出來源身分，不取得 Task 帳密，成功／失敗後均移除。**Task 不建立任何秘密檔案**；只有最終 restore child 的環境複本含帳密，finally 清除，原始 ProcessEnv／ToolContext 不變。認證不傳給 SDK 下載、graph 評估、設定 helper、JavaScript、cdxgen 或 DT。Repo 的 MSBuild targets 可讀 restore 環境，因此應信任被執行的專案。程序被強制終止時，子程序及其環境依 Agent 工作清理政策處理。

原始 JSON、帳密、Basic 組合及編碼在 Azure SDK 匯入前登錄遮罩；此欄位不透過會 debug 原值的 getInput 讀取。錯誤標示依賴安裝階段及來源名稱，不轉印原始 restore 輸出、URL 或密碼。既有 NuGet lockfile 才開 locked mode；鎖檔、packages.config、來源檔及 SDK 宣告不由認證功能改寫。還原後仍要求有效 assets／nupkg，掃描沿用必要 obj/assets 例外；詳見 [.NET Framework](framework.md)及[合併產品](combined.md)。

## 可重跑驗證

```powershell
npm ci
npm test
npm run test:smoke:nuget-auth
# 只驗證 .NET Core（Windows／Linux）：
npm run test:smoke:nuget-auth -- --formats=dotnet
```

腳本在記憶體產生合成帳密及 NuGet nupkg，以 loopback v3 feed 提供私有 Pilot.Private → 公開 Pilot.Public。公開來源不需認證；分層來源設定含 disabled sources 及 source mapping。各次正式 workflow 前清空隔離快取，以實際 nupkg 下載證明認證，不以暖快取當成功。PackageReference fixture 先由工具建立合法鎖檔，再驗證 Task 使用既有鎖檔且 hash 不變；packages.config 不要求額外鎖檔。檢查認證成功／錯誤／缺少、來源隔離、官方1.6 Schema、依賴邊、本機 artifact、輸入 hash、秘密不進日誌／參數／成品、helper 清理，以及真實 ProjectReference 同名異址拒絕。

2026-11-03 Windows x64 四種格式及 Linux x64 SDK-style .NET Core 均通過上述完整檢查，每份 SBOM 有2個套件及私有→公開依賴邊。Node24.22.2、cdxgen13.6.0、SDK10.0.101；Windows 傳統格式使用已安裝 Visual Studio MSBuild17.14。Windows／Linux 各95/95測試通過；typecheck、build、開發 VSIX 及隔離 dist／VSIX 的 Node20.20.2／24.22.1 啟動與 NuGet／npm 衍生秘密遮罩檢查通過。SDK6.0.428／9.0.316另實測官方來源解析 helper，包含舊加密密碼設定而不解密；這兩版沒有重跑本工單完整私人 feed SBOM 矩陣。精簡證據在本工單 checkpoint、`.smoke/nuget-auth/evidence.json` 及 `.smoke/nuget-auth-linux-evidence.json`。

這是合成 feed 與本機 artifact adapter 的證據；實際 Azure Services／Server 安裝及 artifact 上傳、公司 feed、企業 Proxy／CA 仍需相應環境驗收。Task 不把還原帳密交給 cdxgen 的額外授權／metadata 連線，私有 metadata 不保證補齊。


Linux 重跑（PowerShell，需 Docker；使用新 container／volume 名稱保存舊證據）：

```powershell
docker build -f scripts/docker/combined.Dockerfile -t sbom-pilot-10-linux scripts/docker
New-Item -ItemType Directory -Force .smoke | Out-Null
git archive --format=tar HEAD -o .smoke/10-source.tar
$sourceArchive = (Resolve-Path .smoke/10-source.tar).Path
docker volume create sbom-pilot-10-repro
docker run --name sbom-pilot-10-repro `
  --mount type=volume,source=sbom-pilot-10-repro,target=/work `
  --mount "type=bind,source=$sourceArchive,target=/source.tar,readonly" `
  sbom-pilot-10-linux sh -c 'tar -xf /source.tar -C /work && npm ci && npm test && npm run test:smoke:nuget-auth -- --formats=dotnet'
docker inspect sbom-pilot-10-repro --format '{{.State.Status}} {{.State.ExitCode}}'
docker cp sbom-pilot-10-repro:/work/.smoke/nuget-auth/evidence.json .smoke/nuget-auth-linux-evidence.json
```

實際通過來源為 `55753c4`，容器／volume `sbom-pilot-10-nuget-auth` exited0；映像沿用固定 Node／SDK digest 的 [combined.Dockerfile](../scripts/docker/combined.Dockerfile)。此流程使用已安裝 SDK；不宣稱本工單已驗收 Linux 冷 SDK 下載或 Linux .NET Framework。
