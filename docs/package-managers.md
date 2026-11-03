# JavaScript 套件管理器

Task 依宣告與 lockfile 選擇管理器，不需要 Corepack 或全域 npm／pnpm／Yarn。提供 `packageManager: "pnpm@10.34.2"`、`npm@10.9.2` 或 `yarn@4.18.1` 等精確版本時，Task 優先遵循；Node 內建 npm 若已相符即可使用，否則在 Task 暫存目錄隔離準備，驗證實際版本及 Node engine 後執行。標準 sha1／sha224／sha256／sha384／sha512 雜湊後綴也會驗證；npm／pnpm／Classic Yarn 驗證封裝位元組，現代 Yarn 依 Corepack 格式驗證 CLI 執行檔。版本範圍、自訂 URL、未知管理器會報錯。

未宣告精確版本時，npm 固定使用 `11.19.1`；pnpm 單段 YAML 的 lockfileVersion `9`／`9.0` 固定使用 `10.34.2`，不宣稱這是原作者的工具版本。pnpm 12 的多段 YAML 或其他 lock 格式請先明訂精確版本；Task 不會升級鎖檔。Yarn Classic 固定 fallback 為 `1.22.22`，現代 Yarn metadata 10 固定為 `4.18.1`；其他現代格式需明訂精確版本或專案執行檔，詳見 [Yarn 說明](yarn.md)。

npm 專案只能存在一份 `package-lock.json` 或 `npm-shrinkwrap.json`；pnpm 專案使用 `pnpm-lock.yaml`。同根多鎖檔、管理器宣告與鎖檔不同、pnpm workspace 根目錄出現 npm 鎖檔均會在安裝前報錯。缺少或 manifest 不同步時，請在本機以相同管理器修正並提交，不要在 Pipeline 中產生新鎖檔。

pnpm workspace 使用共同根目錄執行 `install --frozen-lockfile`，保留 workspace 清單、來源與安裝設定，不會逐一重裝子套件。若指定子目錄，Task 會往上找到最近的 `pnpm-workspace.yaml`（不越過 Git 邊界）；子目錄有獨立鎖檔或矛盾宣告時會拒絕。掃描仍以輸入的 projectPath 為準，因此要涵蓋整個交付產品，請直接指定共同根目錄。

還原可包含開發套件；最終 SBOM 使用固定 `--required-only`。Task 不額外強制忽略所有腳本，也不改寫 pnpm 的腳本允許政策。pnpm 12 使用原生入口；Task 依已安裝套件的 bin metadata 啟動，不假設所有版本都是 `pnpm.cjs`。所需原生編譯工具仍由 Agent 提供。

範例：[pnpm workspace](../examples/pnpm-workspace/package.json)，包含 Vue 應用程式、共享 workspace 套件與其 lodash 依賴。YAML：

```yaml
steps:
  - checkout: self
  - task: SbomPilot@0
    inputs:
      environment: javascript
      projectPath: '$(Build.SourcesDirectory)/examples/pnpm-workspace'
      uploadToDt: false
```

私有來源以選填 npmCredentials Secret Variable 提供，詳見 [認證格式與來源隔離](npm-auth.md)；請勿把秘密值寫死在 YAML 或提交到設定檔。安裝失敗時 Task 顯示階段與一般原因，不轉印可能含來源 token 的子程序輸出。Task 會清除準備管理器所用的暫存目錄；專案依賴留在 checkout 供 cdxgen 掃描，掃描使用 `--install-deps false`，不再次安裝。

官方行為參考：[npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)、[pnpm install](https://pnpm.io/cli/install)、[pnpm 工具版本與平台](https://pnpm.io/installation)。支援與實測限制見 [README-Dev](../README-Dev.md)。

