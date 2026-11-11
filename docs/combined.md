# .NET Core 前後端合併

`environment: combined` 把共同根目錄內的前端與 SDK-style .NET Core 後端視為一個交付產品。共用一次依賴還原，以 cdxgen 遞迴掃描兩次，皆指定 `-t dotnet -t js --install-deps false`；產品 SBOM 加上 `--required-only`，完整 SBOM 不加。兩份皆經官方 CycloneDX 1.6 Schema 驗證並發佈，預設為 `SBOM/sbom.cdx.json` 與 `SBOM/sbom.cdx-full.json`。預設啟用 OSV，分別掃描兩份 SBOM，將 `OSV弱點報告-產品.md`、`OSV弱點報告-完整.md` 放到相同 Build Artifact，並於建置結果的「OSV 弱點報告」頁籤呈現。取消 `runOsv` 可略過掃描，頁籤顯示未執行。可用 `artifactName`／`sbomFileName` 修改成品名稱及產品 SBOM 檔名，完整 SBOM 檔名會在最後的 `.json` 前加 `-full`。OSV 失敗門檻只以完整 SBOM 判定；DT 預設上傳完整 SBOM，可由「DT 上傳版本」改為產品 SBOM，每次只傳送選定的一份至一個既有 DT 專案 UUID。

## 根目錄與依賴還原

[可執行範例](../examples/combined-product/package.json)保持原需求的根目錄 pnpm workspace 形狀：

```text
product/                     ← projectPath
  package.json               # pnpm@10.34.2
  pnpm-workspace.yaml         # packages/*
  pnpm-lock.yaml
  packages/web/package.json
  packages/shared/package.json
  backend/Product.csproj
  backend/global.json        # SDK 10.0.101
  backend/NuGet.Config
```

也可將獨立前端放在 `frontend/`，其內包含管理器宣告與 lockfile。Task 探索所有未排除的 `package.json`／pnpm workspace，從擁有 workspace 的根目錄安裝一次，不逐一安裝成員；npm workspaces、pnpm 與 Yarn workspaces 均沿用既有管理器 adapter。獨立專案各自需有且僅一種鎖檔。宣告版本／管理器或雙方提供的雜湊互相矛盾、成員另有鎖檔、未納入 workspace 的鎖檔不足子專案、workspace 根目錄在共同根目錄之外，都會停止並要求修正。workspace 根目錄的管理器及完整性驗證政策為安裝依據。

前端管理器、精確版本／雜湊、Yarn 專案執行檔、frozen／immutable 行為及腳本政策見[管理器文件](package-managers.md)及 [Yarn 文件](yarn.md)。後端使用既有 .NET Core SDK 選擇與 restore；已有 NuGet lockfile 才啟用 locked mode，沒有選用鎖檔的合法專案仍可還原。傳統 .NET Framework 專案使用獨立 `netframework` 模式；合併模式目前限定 SDK-style .NET Core。

## 共用排除規則

Classic Build 選擇「.NET Core 前後端合併」並填共同 `projectPath`；其他欄位與單一環境相同。YAML 範例見 [README](../README.md#net-core-前後端合併模式)。預設排除可加入相對共同根目錄的產品特有路徑，例如：

```text
**/_Design{,Front}/**,**/bin/**,**/obj/**,**/node_modules/**,**/dist/**,frontend/prototypes/**,backend/Tests/**
```

同一組 glob 用於前後端探索與掃描，保留花括號內逗號。workspace 的嚴格安裝仍必須維持已提交的 workspace／lockfile 完整性；排除掃描路徑不會重新編寫 workspace 成員或裁切鎖檔。`**/obj/**` 在掃描時轉換成 `**/obj/!(project.assets.json)`，以保留經還原驗證的 NuGet 間接依賴資料。其他自訂排除若遮蔽必要 assets，或 ProjectReference 的資料在共同根目錄外，會失敗而不發佈。

`--required-only` 是上游工具的 scope 篩選，不等於逐項核對實際部署。cdxgen 13.6.0 的 Yarn workspace 會將部分 dev-only chalk 標記 required 並保留；本版保持工具定義。pnpm／npm 範例的 chalk 則被排除。細節見 [Yarn 限制](yarn.md)。

## 可重跑的本機驗證

Windows x64 需有對應 SDK；本範例 SDK 固定 10.0.101。Task 的缺少 SDK 自動準備流程另有既有 .NET Core smoke 驗證。以下會使用公開 registry／NuGet、建立忽略的 `.smoke/combined`，不修改範例鎖檔：

```powershell
npm ci
npm test
npm run test:smoke:combined
```

此腳本預設跑 pnpm、npm、Yarn Classic、現代 PnP、現代 node-modules、獨立 .NET Core。指定子集合可使用 `-- --scenarios=pnpm,dotnet`。npm 場景先在暫存複本建立 fixture 鎖檔，真正 workflow 一律執行嚴格 `npm ci`。

Linux 用本機 Docker 重跑實際 .NET Core 還原及合併掃描。映像以 [Dockerfile](../scripts/docker/combined.Dockerfile)固定 Node24 bookworm 與 Microsoft SDK10.0.101 來源 digest；執行的最終 OS 是 SDK 映像的 Ubuntu24.04.3。從已提交的版本匯出，不把 Windows node_modules 複製至容器。以下 PowerShell 命令使用專屬 volume/container 名稱，若已存在請改用新的名稱以保存上次證據：

```powershell
docker build -f scripts/docker/combined.Dockerfile -t sbom-pilot-07-linux scripts/docker
New-Item -ItemType Directory -Force .smoke | Out-Null
git archive --format=tar HEAD -o .smoke/07-source.tar
$sourceArchive = (Resolve-Path .smoke/07-source.tar).Path
docker volume create sbom-pilot-07-work
docker run --name sbom-pilot-07-linux `
  --mount type=volume,source=sbom-pilot-07-work,target=/work `
  --mount "type=bind,source=$sourceArchive,target=/source.tar,readonly" `
  sbom-pilot-07-linux sh -c 'tar -xf /source.tar -C /work && node --version && npm --version && dotnet --version && cat /etc/os-release && npm ci && npm test && npm run test:smoke:combined -- --scenarios=pnpm,dotnet'
docker inspect sbom-pilot-07-linux --format '{{.State.Status}} {{.State.ExitCode}}'
docker cp sbom-pilot-07-linux:/work/.smoke/combined/evidence.json .smoke/combined-linux-evidence.json
```

容器保留以便檢查；不需特權、Docker socket 或宿主全域 SDK 安裝。Linux .NET Framework 為不適用。測試接入的是本機 artifact adapter，不能作為真實 Azure DevOps 發佈證據。

## 驗證紀錄

2026-11-03 實測，cdxgen13.6.0、掃描 Node24.22.2、SDK10.0.101、公開 npm／NuGet、關閉授權補充：

| 平台／情境 | 有效組件數 | 實際驗證 |
| --- | --- | --- |
| Windows x64，pnpm 根 workspace＋後端 | 30 | shared→lodash、Logging→Abstractions；一份成品，鎖檔不變；stale workspace 在掃描前失敗 |
| Windows x64，npm 前端＋後端 | 8 | is-odd→is-number、Logging→Abstractions；一份成品，鎖檔不變 |
| Windows x64，Yarn Classic／modern PnP／modern node-modules＋後端 | 各12 | workspace shared→is-odd→is-number、Logging→Abstractions；一份成品，鎖檔不變 |
| Windows x64，獨立 .NET Core | 6 | 真實 restore、直接／間接 NuGet 及關係、一份成品 |
| Linux x64 Ubuntu24.04.3 容器，pnpm 根 workspace＋後端 | 30 | 真實 restore、前端與後端依賴邊、一份成品，鎖檔不變；stale lock 在掃描前失敗 |
| 同一 Linux 容器，獨立 .NET Core | 6 | 真實 restore、Logging→Abstractions、一份成品 |

所有場景均記錄恰一次 scanner 呼叫及本機 artifact callback，驗證 required-only／install-deps=false、共用設計目錄排除與官方1.6 Schema。Windows host Node24.22.1；容器 Node24.22.2/npm11.19.1。容器 fresh npm ci 與76/76測試通過，執行來源提交 `3c7f69b`。固定 SDK digest 為 `sha256:5504edd1267dd4deab3443f960cfab219249c8bd935fbcc358f1c24aeae23fe0`，Node來源 digest 為 `sha256:e7add2a490bb17d97b485b8641bd88455fff7839ade0f5eba493c3508124d413`。本機證據 JSON 含平台／版本、各次 SBOM hash 與組件數；完整產物與日誌不提交。

此處保留先前公開來源、SDK 預裝矩陣。最終 VSIX 另已完成 Windows/Linux 私有 npm＋NuGet combined，以及無 SDK 的 plain Node Docker 官方 SDK 冷安裝；當前證據與重跑命令見 [相容性](compatibility.md)。真實 Services/Server 安裝、Classic/YAML、原生成品下載／故障傳播、公司 feed／企業 Proxy/CA、arm64 仍待外部環境驗收。

