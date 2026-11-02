# 開發與交付

SBOM Pilot 由 Lawrence Shen 開發，採 MIT。維護環境使用 Node >=24；Windows 實測 Node24.22.1/npm11.19.1，Linux Docker Node24.22.2/npm11.19.1。Task bundle 目標 Node20，提供 Node20_1／Node24 同一入口；掃描 Node24 由 Task 獨立準備。

## 建置與檢查

```powershell
npm ci
npm run typecheck
npm test
npm run package:dev
npm run test:package
```

單元／整合測試使用 Node test runner，涵蓋四模式、鎖檔、官方 Schema、選項、SDK/MSBuild、來源隔離、Proxy/CA、DT、失敗後成品、初始化前秘密遮罩與 UTF-8。先完成上述檢查，再選擇受變更影響的真實 smoke，無需重跑所有不變的外部下載矩陣。

| 命令 | 真實驗證 |
| --- | --- |
| `test:smoke` | npm/Vue、required-only、chalk 排除、鎖檔不變 |
| `test:options-smoke` | 花括號 glob、空白路徑、授權／快取、版本拒絕 |
| `test:smoke:pnpm` | workspace、精確 npm/pnpm、原生 pnpm12、frozen 失敗 |
| `test:smoke:yarn` | Classic、Yarn4 PnP/node-modules、雜湊、yarnPath、嚴格失敗 |
| `test:smoke:dotnet` | .NET Core SDK6/9/10、間接依賴、鎖檔與 SDK 政策 |
| `test:smoke:framework` | Windows SDK-style、非 SDK PackageReference、packages.config |
| `test:smoke:combined` | 共同根目錄、各前端管理器＋.NET Core、一次掃描 |
| `test:smoke:npm-auth` | loopback Bearer/Basic、公開來源並存、七種管理器／合併路徑 |
| `test:smoke:nuget-auth` | loopback v3、四種 .NET 格式、來源 graph、錯誤／缺認證 |
| `test:final` | 實際 VSIX 入口、真實 install/restore/scan、DT、同一成品及本機發佈故障 |

以上命令均以 `npm run <command>` 執行。外部下載、合成來源與暫存資料不提交。`test:smoke:yarn -- --refresh-fixtures` 是明確更新範例鎖檔的維護模式；正常 Task 與 smoke 嚴格使用已提交鎖檔。

## 最終 VSIX 驗收

先執行 npm test、package:dev。`npm run test:final` 將目前 VSIX 解到 Repo 外，執行原始 handler。Windows 預設跑 npm、pnpm workspace、Yarn4 PnP、私有 .NET Core、私有前後端合併、三種 Framework 格式及 artifact adapter 故障；Linux 預設跑 npm、私有合併與 artifact 故障。可用 `npm run test:final -- --cases=pnpm,combined` 選擇受影響場景。

Windows 可設 `SBOM_FINAL_NODE20` 為實際 Node20 執行檔，讓 npm 場景使用該入口。單獨入口檢查：

```powershell
node scripts/verify-package.mjs --node <absolute-node20-path> --node <absolute-node24-path>
```

此檢查在 Repo 外驗證 dist/VSIX 位元組一致、四模式／雙 handler、SDK 動態資源載入／glob／子程序、秘密先遮罩、runtime 告示及套件內 Markdown 連結。`node scripts/acquire-handler.mjs 20` 可下載並校驗 Windows 測試用 Node20，不會替 Agent 安裝 handler。

final-smoke 使用真正本機 HTTP npm/NuGet/DT 服務，讀取 artifact.upload 命令，確認檔案在退出後仍存在且與 DT 接收位元組相同。發佈故障僅用開發 preload 讓真實 SDK adapter 拋錯，不修改產品入口。這些是本機證據，**不是 Azure 成品上傳／下載或 Agent 非同步失敗傳播的驗收**。忽略的 `.smoke/final-delivery/evidence.json` 和去除 setsecret 命令的日誌記錄版本／VSIX及SBOM SHA-256，不保存秘密。Yarn 正常安裝會格式化部分 workspace package.json，測試比較其值；鎖檔／來源設定仍逐位元組比較。

Linux 冷啟動必須用沒有 SDK 的 Node 映像與全新 volume；已有同名資源時換新名稱保存舊證據：

```powershell
New-Item -ItemType Directory -Force .smoke | Out-Null
git archive --format=tar HEAD -o .smoke/final-source.tar
$sourceArchive = (Resolve-Path .smoke/final-source.tar).Path
docker volume create sbom-pilot-final-repro
docker run --name sbom-pilot-final-repro `
  --mount type=volume,source=sbom-pilot-final-repro,target=/work `
  --mount "type=bind,source=$sourceArchive,target=/source.tar,readonly" `
  --workdir /work `
  node:24-bookworm@sha256:e7add2a490bb17d97b485b8641bd88455fff7839ade0f5eba493c3508124d413 `
  sh -c 'tar -xf /source.tar -C /work && if command -v dotnet; then exit 1; fi && npm ci && npm test && npm run package:dev && npm run test:package && npm run test:final'
docker inspect sbom-pilot-final-repro --format '{{.State.Status}} {{.State.ExitCode}}'
docker cp sbom-pilot-final-repro:/work/.smoke/final-delivery/evidence.json .smoke/final-linux-evidence.json
```

首次 combined 由官方 dotnet-install 安裝 SDK10.0.101，再真實還原私有 npm/NuGet、掃描及上傳到 loopback DT。Node20 Docker 可在同一 volume 使用已建置產物執行 test:package 與 test:final 的 npm 場景，工具 Node24 仍由 Task 驗證。不需特權或 Docker socket。保留資源直到證據複查，再清理指定資源。當前矩陣與 live runbook 見 [相容性](docs/compatibility.md)。

## 模組與邊界

| 模組 | 責任 |
| --- | --- |
| azure-secret-inputs.ts／index.ts | 先捕捉／遮罩秘密再載入 SDK；Azure input/result/artifact adapter |
| config.ts／tool-options.ts | 嚴格布林、空排除、Node/cdxgen/Spec 契約 |
| workflow.ts | WorkflowServices 注入 prepare/install/scan/validate/upload/publish；DT 失敗仍先發佈 |
| process.ts | 無 shell、逾時／程序樹清理、UTF-8、抑制秘密輸出 |
| tools.ts／node-cache.ts | SHA-256、版本、原生安全解壓、完整標記／原子快取、隔離 cdxgen |
| install/ | 管理器版本／雜湊、workspace、嚴格安裝、共同根目錄與 combined |
| dotnet/ | SDK／MSBuild、restore graph、assets／鎖檔／nupkg 完整性 |
| npm-auth.ts／credentials.ts／sources.ts | 有效來源及 physical sourceRoot guard；僅 install／restore 認證 |
| scan.ts／validation.ts | 單次 required-only、禁止重複 install、必要 assets 例外、官方1.6 Schema |
| dt/／network/ | 接受 token、有限重試、Proxy/CA/client certificate、redirect／大小／逾時界限 |

ToolContext 保存 child env 及已驗證 dotnetAssets/dotnetPackageFiles，installer 包裝器必須保留。私有認證不寫入 ToolContext，不傳給工具準備、scanner 或 DT；npm 暫存須在實際 sourceRoot/Git 根目錄外且 finally 清理。NuGet 使用實際工具的 Configuration API，保留分層設定，不以全域 config 取代 Repo。

Node 快取按版本／架構隔離，只公開經實際執行版本驗證的完整 staging；並行寫入者驗證勝出目錄，不完整目的地明確失敗，不刪除另一工作目錄。舊 tool-lib 完整快取仍驗證後可讀。Linux tar 限根目錄內路徑／連結，Windows ZIP 拒絕 traversal/symlink；保留 npm 相對連結。Node 工具快取與 cdxgen metadata 快取各自獨立。

## Runtime 授權與 audit

建置依兩份 esbuild metafile 盤點 handler 與真實 Task SDK closure，目前25筆，保留每份原始授權、SDK metadata／所有非程式資源。SDK task.js 保持原套件目錄與動態 resource JSON 語意；未使用 mock-test/downloader/tool-lib 不分發。建置拒絕未解析的非 builtin SDK import。詳見 [第三方告示](THIRD-PARTY-NOTICES.md)。

`npm audit --omit=dev` 目前有一項上游 minimatch moderate advisory、兩個受影響條目（minimatch/task-lib），無相容修正版、無 high/critical；產品 closure 確實使用該 minimatch。未套用破壞 SDK API 的 major override。開發樹的 SDK 仍宣告未封裝的 downloader，不捏造其缺漏 ISC 告示；產品已不含該模組，原公開告示缺漏 gate 已消除。發版時重新執行 audit 並記錄結果。

## 版本與公開發佈準備

VSIX 位於 packages/local-dev-placeholder.sbom-pilot-0.1.0.vsix。package:dev 使用 public:false、Local Development 名稱與 placeholder publisher。實際 Publisher／公開 Repo URL 尚未提供，不捏造 Marketplace 連結。

確認 Publisher 權限、公開 HTTPS Repo、版本說明及 [live 驗收](docs/compatibility.md) 後設定：

```powershell
$env:SBOM_PILOT_PUBLISHER = '<actual-publisher-id>'
$env:SBOM_PILOT_REPOSITORY_URL = 'https://<public-repository-url>'
npm run package:release
```

命令只建置 VSIX，不上傳 Marketplace。正式包裝拒絕缺少身分／URL、local placeholder 或未解決 runtime 告示，不可使用文件佔位值。package.json、src/task.json、vss-extension.json 同步改版；GUID／名稱固定，Task major 影響 SbomPilot@0。更新 [CHANGELOG](CHANGELOG.md)，保存 VSIX hash、版本與證據；公開前須完成獨立程式碼審查。

外部 gate：實際 Publisher／公開 Repo、真實 Services/Server 安裝、Classic/YAML UI與工作、成品下載／失敗傳播、公司 feed／企業 Proxy/CA、arm64。SDK/workload 與 Yarn required scope 限制保持明示，未測項目保留 UNVERIFIED。
