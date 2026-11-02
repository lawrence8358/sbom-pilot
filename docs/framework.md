# .NET Framework

在 Windows Agent 選擇 **.NET Framework（Windows）**，YAML 使用 `environment: netframework`。Task 依實際專案與套件格式還原，再以共用流程產生 CycloneDX 1.6、選用上傳 DT，並要求 Agent 發佈 `SBOM` Build Artifact。

## 格式與工具

| 專案格式 | 還原方式 | Agent 條件 |
| --- | --- | --- |
| SDK-style、PackageReference，包含 net48 | Task 準備／驗證指定 .NET SDK，執行 dotnet restore | Windows；SDK 所需原生環境，遵循 global.json |
| 非 SDK-style、PackageReference | Visual Studio MSBuild 的 NuGet Restore targets | 預裝 MSBuild >=17.8、NuGet 元件、相符 .NET Framework Developer/Targeting Pack 與專案 workloads |
| 傳統 packages.config | MSBuild Restore，加上 RestorePackagesConfig=true | 同上；可判定的 solution／repositoryPath，套件清單完整 |

此實作要求 **Visual Studio MSBuild 17.8 以上**，以結構化屬性查詢保留有效的專案設定。Microsoft 的 packages.config restore 功能本身從 MSBuild 16.5 起提供；這不代表本 Task 已支援所有 16.5 以上版本。實測版本為 Visual Studio 2022 Enterprise 的 MSBuild 17.14.51。

Task 透過 Agent 現有的 vswhere 尋找含 MSBuild 的 Visual Studio／Build Tools；也接受 Agent 已設定的 `MSBUILD_EXE_PATH`。這是機器環境設定，沒有新增 Task 路徑欄位。Task 使用 MSBuild 隨附的 NuGet restore engine，不要求額外 NuGet.exe 或 Authenticate Task，也不安裝整套 Visual Studio。缺少 MSBuild、NuGet Restore targets、Developer Pack 或專案 Import 所需 workloads 時，會指出應補齊的工具類別並停止。特殊專案仍須由維護者在 Agent 安裝相應 workload。

SDK-style 使用與 [.NET Core 模式](../README.md#net-core-模式) 相同的 SDK 選擇政策：從還原目錄套用 global.json；缺少一般 SDK 時由 Task 安裝；未宣告版本時使用固定 10.0.101。SDK-style 的還原不強制依賴完整 Visual Studio。

## 使用方式

```yaml
steps:
  - checkout: self
  - task: SbomPilot@0
    inputs:
      environment: netframework
      projectPath: '$(Build.SourcesDirectory)'
      specVersion: '1.6'
      uploadToDt: false
```

Classic Build 在 Agent job 加入 **SBOM Pilot**，將開發環境選為 **.NET Framework（Windows）**；專案路徑包含交付產品的專案、solution 及必要還原資料。不需另外加入 restore 步驟。Linux 會在工具下載前拒絕此模式；跨平台目標不代表傳統 Framework 可在 Linux 執行。

packages.config 預設套件位置是 solution 下的 packages 目錄。Task 只接受實際包含該專案、位於共同掃描根目錄中的 `.sln`，或 NuGet.Config 明確的 repositoryPath；不猜測套件位置。使用 `.slnx` 或特殊 solution 配置時，本版不自動推導其目錄，可在現有 NuGet.Config 明確設定 repositoryPath。範例：

```xml
<configuration>
  <config>
    <add key="repositoryPath" value="packages" />
  </config>
</configuration>
```

這段是補入既有設定的示意；請保留原有 packageSources、packageSourceMapping、proxy、信任與其他設定。Task 使用 NuGet 官方設定函式庫解析既有分層設定及相對路徑，沒有用單一暫存 config 取代它們。套件來源需可存取；Task 管理的私有 NuGet 認證欄位由後續功能提供。

## 鎖定資訊與依賴完整性

PackageReference 有既存 lockfile 時啟用 locked mode，並驗證其內容不變；可使用專案匯入屬性宣告的自訂 lockfile 路徑。沒有選用 NuGet lockfile 的專案不會被誤拒，也不需要 npm lockfile。

packages.config 本身保存套件版本；restore 不會自動修補缺漏的套件清單。Task 保留該檔案內容，驗證每個清單項目的實際 nupkg 套件資料；請先在專案內正確安裝並提交完整清單。PackageReference 則驗證實際 project.assets.json。缺少這些資料時停止，不把只含直接套件的結果當作完整依賴清單。

沿用 .NET 的 obj 技術例外：只將既定 `**/obj/**` 轉成 `**/obj/!(project.assets.json)` 送給掃描器，使依賴圖可讀，其餘編譯輸出仍排除。其他自訂 glob 不會改寫。必要 assets、packages.config 或 nupkg 若被自訂排除，或位於掃描根目錄之外，Task 會清楚失敗；請選擇包含專案及套件資料的共同根目錄。

`--required-only` 仍以所選 cdxgen 的 scope 為準；packages.config 是平面清單，可取得的套件關係由已還原 nupkg 等資料補充，不能宣稱已逐項核對部署成品。

## 驗證範圍

Windows x64 已實測 SDK-style net48、非 SDK-style PackageReference、packages.config：每種格式均含 Microsoft.Extensions.Logging 及 Microsoft.Extensions.Logging.Abstractions 的間接依賴與明確關係，通過 CycloneDX 1.6 Schema，設定檔／專案檔／既有鎖檔內容不變。包括自訂 repositoryPath、既有鎖檔不一致、缺少 MSBuild 與缺少 workload targets 的失敗案例。

實際 Azure DevOps Services／Server 的 VSIX 安裝、Classic UI 及原生成品下載仍待外部環境驗證。詳見 [開發紀錄](../README-Dev.md)。
