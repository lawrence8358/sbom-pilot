# 私有 npm 來源認證

Vue 與 .NET Core 前後端合併模式可使用選填進階欄位 `npmCredentials`，由同一 Task 完成 npm／pnpm／Yarn 的私有套件嚴格安裝、SBOM 驗證及成品發佈。認證欄位不設定來源路由：registry、scope、workspace、鎖檔與安裝腳本仍由 Repo 及所選管理器決定。

## Secret Pipeline Variable 與欄位

在 Pipeline Variables 建立秘密變數 `npmCredentials`，勾選保密，值為下列 JSON。以下值皆為佔位，不要把真實 token 或密碼提交至 YAML／Repo：

```json
[
  {
    "registry": "https://packages.example.test/npm/private/",
    "token": "<registry-read-token>",
    "environment": { "NPM_TOKEN": "token" }
  },
  {
    "registry": "https://packages.example.test/npm/other/",
    "username": "<feed-user>",
    "password": "<feed-password-or-PAT>",
    "environment": {
      "FEED_USER": "username",
      "FEED_PASSWORD_B64": "passwordBase64",
      "FEED_IDENT": "basic"
    }
  }
]
```

每筆必填 `registry` 及一種認證：`token`，或同時提供 `username`／`password`；不能混填。帳號不可含冒號。URL 只接受 HTTP／HTTPS，不可含 userinfo、query 或 fragment；補齊結尾 `/`，保留 registry 路徑。同一 host／path 不可重複；npm 相容認證鍵不含協定，因此 HTTP 與 HTTPS 的相同 host／path 亦不可各設一筆。最多20筆、輸入上限128KiB。空白或 `[]` 表示不新增認證。

`environment` 選填，僅用於 Repo 已有的認證環境變數佔位。它把**變數名稱**對應到此筆認證的**欄位別名**，由 Task 明確注入專案子程序；不假定 Secret Pipeline Variable 自動出現在環境中，也不猜測 `NPM_TOKEN` 等名稱。沒有認證佔位、只設定來源路由的 Repo 可省略此物件。

| 別名 | 子程序取得的值 | 認證類型／常用欄位 |
| --- | --- | --- |
| `token` | token 原值 | Bearer；npm `_authToken`、Yarn `npmAuthToken` |
| `username` | 帳號原值 | Basic；npm `username` |
| `password` | 密碼原值 | Basic；需要原始密碼的既有認證變數 |
| `passwordBase64` | 僅密碼的 Base64 | Basic；npm `_password` |
| `basic` | `username:password` | Basic；Yarn `npmAuthIdent` |
| `basicBase64` | `username:password` 的 Base64 | Basic；npm `_auth` |

名稱使用大寫英文字母、數字、底線，首字為字母，最多128字元；同一名稱不能分配給多筆認證。`NODE_AUTH_TOKEN` 可使用；PATH、HOME、Proxy、CI 及 Node/npm/pnpm/Yarn 等程序／設定控制變數不可用來映射。別名必須適用此筆認證，token 不能映射成密碼。映射變數只能用於同一 registry 的認證欄位，不能放進來源 URL 或不相關來源；無法安全對應時會在安裝前明確失敗。

## Repo 設定與 YAML／Classic

npm、pnpm10、Yarn Classic 的 Repo `.npmrc` 範例：

```ini
registry=https://registry.npmjs.org/
@company:registry=https://packages.example.test/npm/private/
//packages.example.test/npm/private/:_authToken=${NPM_TOKEN}
```

Basic 範例使用另一個 scope／來源：

```ini
@other:registry=https://packages.example.test/npm/other/
//packages.example.test/npm/other/:username=${FEED_USER}
//packages.example.test/npm/other/:_password=${FEED_PASSWORD_B64}
```

現代 Yarn `.yarnrc.yml`：

```yaml
nodeLinker: pnp # 也可保留原有 node-modules
npmScopes:
  company:
    npmRegistryServer: https://packages.example.test/npm/private/
    npmAuthToken: ${NPM_TOKEN}
  other:
    npmRegistryServer: https://packages.example.test/npm/other/
    npmAuthIdent: ${FEED_IDENT}
```

Task 輸入只填秘密變數參照：

```yaml
- task: SbomPilot@0
  inputs:
    environment: vue # 合併產品使用 combined，保留同一個共同 projectPath
    projectPath: '$(Build.SourcesDirectory)'
    npmCredentials: '$(npmCredentials)'
    uploadToDt: false
```

Classic Build 在同一欄位填 `$(npmCredentials)`，含義相同。無需 Service Connection、Authenticate Task 或另一個 install Task。`uploadToDt` 開關不影響來源認證。

## 管理器差異與設定優先序

- npm、pnpm10、Classic：Task 在 Repo 外建立暫存 userconfig，只替換相符來源的使用者認證，保留原有使用者設定／其他來源。Repo `.npmrc` 優先序更高，因此既有認證欄位須使用上列明確映射；相同來源的固定 token 或無法對應的認證設定會精確報錯，不改寫 Repo。以 npm 官方的[registry-scoped 認證](https://docs.npmjs.com/cli/v11/configuring-npm/npmrc/)為基準。
- pnpm12：Repo 中認證設定的環境變數不會展開，Task 使用獨立可信暫存 auth file，透過 `PNPM_CONFIG_NPMRC_AUTH_FILE` 指向它。原有 npm userconfig 與專用 auth file 分別保留、分別複製，避免把設定當成認證檔而遺失。原生12的全域來源路由使用 native `rc`／`config.yaml` 或 Repo `.npmrc`；`NPM_CONFIG_USERCONFIG` 是認證 fallback，不應假設它能路由套件。參考[官方認證規則](https://pnpm.io/npmrc)、[設定位置](https://pnpm.io/cli/config)、[npmrcAuthFile](https://pnpm.io/settings#npmrcauthfile)。
- 現代 Yarn：不讀取 `.npmrc` 認證。Task 透過 repo 外的暫存 plugin，在官方 `validateProject` hook 中只更新相符 registry／scope 的記憶體認證，包括 `npmAlwaysAuth`；保留 `.yarnrc.yml` 的探索、相對路徑、PnP／node-modules、路由及既有 plugins。明確映射在 config／版本初始化前提供，支援相同來源的 `${NAME}`、`${NAME:-fallback}`、`${NAME-fallback}` 認證佔位。全域 `npmAuthToken`／`npmAuthIdent` 不能使用 Task 映射，以免套到其他 registry；請使用 per-registry／per-scope 欄位。機制依據[設定與環境規則](https://yarnpkg.com/configuration/yarnrc/)、固定4.18.1的 [Plugin hook](https://github.com/yarnpkg/berry/blob/%40yarnpkg/cli/4.18.1/packages/yarnpkg-core/sources/Plugin.ts)及[來源認證優先序](https://github.com/yarnpkg/berry/blob/%40yarnpkg/cli/4.18.1/packages/plugin-npm/sources/npmConfigUtils.ts)。

Task 不擴大來源範圍：若 metadata 與套件下載使用不同的需要認證 URL／路徑，明確列出各來源；不新增 host-wide token，不改動 registry/scope 路由。同一 registry URL 只支援一組 Task 認證，多個 scope 共用它；同 URL 各 scope 需要不同 token 的形式目前不支援。用戶端對更高優先序的原有 Agent 認證仍依其版本規則處理；相衝突時請統一認證來源。

## 生命週期與驗證

秘密 JSON、token、帳密及必要的 Basic 編碼在載入 Azure SDK／讀取一般輸入前登錄遮罩；認證欄位不經會輸出原值的 `getInput`。管理器本身的下載／安裝保留原工具環境；Task 新增的認證只給專案設定初始化與 install，不提供給 cdxgen、.NET Core、DT 或其他工具。Repo 安裝腳本沿用管理器政策，因此可信任的安裝腳本也可讀取其子程序環境。

暫存 userconfig 使用環境變數佔位；現代 plugin 由子程序環境讀取認證。它們位於 Repo 外，在成功／失敗後均由 finally 移除，不發佈至成品。不修改使用者原設定、Repo 或鎖檔。暫存位置會同時檢查 Git repo、共同掃描根目錄與實際檔案路徑；即使是非 Git 合併目錄或 symlink，也不能把認證放入產品範圍。若 Agent.TempDirectory 位於來源內，會要求修正。原始子程序輸出不轉印；失敗標示依賴安裝／私有來源，提示核對 URL 路徑、權限、設定與鎖檔。強制終止整個 Agent 程序時無法保證 finally 執行，暫存區仍依 Agent 清理政策處理。

可重跑的本機驗證：

```powershell
npm ci
npm test
npm run test:smoke:npm-auth
# 單一情境，例如原生 pnpm12：
npm run test:smoke:npm-auth -- --scenarios=pnpm12
```

腳本在記憶體生成合成認證及 loopback registry，用真正 npm-packed 私有／公開套件驗證；不需要公司認證。套件與 cache 位於忽略的 `.smoke/npm-auth`。每次 workflow 前清空隔離 cache，以實際 tarball 請求證明認證，而非沿用暖快取；現代 Yarn fixture 也隔離 global folder／mirror。鎖檔只在 fixture authoring 建立，正式 workflow 仍為 frozen／immutable。

檢查包含 Bearer＋Basic 的私有套件與無認證公開套件並存、明確變數及既有設定、私有→公開依賴邊、官方1.6 Schema、單次掃描／本機成品、錯誤／缺少認證、前置失敗、清理、來源設定／鎖檔 hash 不變，以及產物／Task 日誌／生成設定中不含秘密。合併產品另驗證後端 NuGet 依賴邊。Windows 代表版本為 npm11.19.1、pnpm10.34.2／原生12.16.1、Classic1.22.22、Yarn4.18.1 PnP／node-modules；2026-11-03 最終 Windows 七種情境已全通過：npm4、pnpm10/12各3、Classic/PnP/node-modules各4、combined10個有效組件。Linux Ubuntu24.04.3 x64 容器亦實測 npm4、原生pnpm12=3、PnP4、combined10個組件，包含相同的認證／失敗／清理／來源隔離檢查；兩個平台均通過91/91測試。Node24.22.2、cdxgen13.6.0；合併後端使用SDK10.0.101。詳細版本與各次產物hash保存在本機 evidence JSON及工單09 checkpoint。

這是合成 registry 與本機 artifact adapter 的驗證；實際 Azure Services／Server 的安裝／下載、公司 feed、企業 Proxy／CA 與私有套件授權補充仍需對應環境驗收。cdxgen 使用既有鎖檔／還原資料，Task 不把專案認證傳給其 metadata／授權補充連線；私有 metadata 無法匿名取得時不保證補齊授權資訊。Yarn required scope 的既有限制維持不變。

Linux 可重跑命令（PowerShell；容器／volume 已存在時請使用新名稱保存舊證據）：

```powershell
docker build -f scripts/docker/combined.Dockerfile -t sbom-pilot-09-linux scripts/docker
New-Item -ItemType Directory -Force .smoke | Out-Null
git archive --format=tar HEAD -o .smoke/09-source.tar
$sourceArchive = (Resolve-Path .smoke/09-source.tar).Path
docker volume create sbom-pilot-09-repro
docker run --name sbom-pilot-09-repro `
  --mount type=volume,source=sbom-pilot-09-repro,target=/work `
  --mount "type=bind,source=$sourceArchive,target=/source.tar,readonly" `
  sbom-pilot-09-linux sh -c 'tar -xf /source.tar -C /work && npm ci && npm test && npm run test:smoke:npm-auth -- --scenarios=npm,pnpm12,yarn-pnp,combined'
docker inspect sbom-pilot-09-repro --format '{{.State.Status}} {{.State.ExitCode}}'
docker cp sbom-pilot-09-repro:/work/.smoke/npm-auth/evidence.json .smoke/npm-auth-linux-evidence.json
```

映像沿用[固定 Node／SDK digest 的 Dockerfile](../scripts/docker/combined.Dockerfile)。實際最終執行來源為 `a4b85be`，容器 `sbom-pilot-09-final` exited0；首次容器先完成 fresh npm ci，修正 fixture 後在同一專屬 volume 重跑91項測試及上述四種私有認證情境。此 Linux 測試使用已安裝 SDK，不宣稱冷 SDK 下載路徑已驗收；Linux .NET Framework 不適用。
