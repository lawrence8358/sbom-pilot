# Yarn 支援與限制

使用 `environment: vue`，提供包含 `package.json` 與 `yarn.lock` 的專案／workspace 根目錄。Task 不使用任意全域 Yarn，也不要求 Corepack 或額外 install Task。

## 版本與設定

`packageManager` 的精確 Yarn 版本優先。Classic 透過 npm 套件 `yarn` 準備，現代 Yarn 使用 `@yarnpkg/cli-dist`。有專案 `yarn-path`／`yarnPath` 時，會執行該 JavaScript 發行檔確認實際版本，並與宣告及鎖檔世代核對；沒有精確宣告時以實際執行結果判定，不從檔名猜測。現代 `.yarnrc.yml` 的 `ignorePath: true` 仍有效。

Classic 使用 `.yarnrc`，現代 Yarn 使用 `.yarnrc.yml`；各自保留其世代的來源、workspace、佈局及腳本設定。專案執行檔必須是明確的本機 `.js`／`.cjs`／`.mjs` 路徑，目前不展開 `yarnPath` 的環境變數占位。執行時會鎖定已選定的入口，避免再被其他路徑設定轉派到未驗證版本。

沒有精確版本或專案執行檔時，fallback：

| 鎖檔格式 | 固定工具 |
| --- | --- |
| `# yarn lockfile v1` | Yarn Classic 1.22.22 |
| 現代 `__metadata.version: 10` | Yarn 4.18.1 |
| 其他現代格式 | 明確失敗；請宣告與該鎖檔相容的精確版本 |

fallback 不是原作者版本的推定。Yarn 4.18.1 實測會產生 metadata 10，不把舊格式一律升級到新工具。Yarn 2／3 可依宣告準備，但尚未列入本次實測支援組合。

標準 `packageManager` 雜湊後綴會核對實際下載內容：Classic 為 npm 封裝，現代 Yarn 為分發的 `bin/yarn.js`；這與 [Corepack 發行定義](https://raw.githubusercontent.com/nodejs/corepack/main/config.json)一致。現代本機 `yarnPath` 也可與 CLI 雜湊核對。Classic 本機單檔搭配封裝雜湊無法等同比對，目前會拒絕；請選擇標準套件發行，或使用不含封裝雜湊的精確版本宣告與專案執行檔。

## 嚴格安裝與 workspace

Classic 執行 `install --frozen-lockfile --non-interactive`，接著執行 `check --integrity --non-interactive`。真實測試發現只使用 frozen install 可能接受 workspace 新增但未鎖定的依賴；第二步使用 [Yarn 自身的完整性檢查](https://raw.githubusercontent.com/yarnpkg/yarn/v1.22.22/src/cli/commands/check.js)，確保這種情況失敗。現代 Yarn 執行 `install --immutable`，不強制要求預先存在套件快取。兩者皆檢查前後 lockfile SHA-256，並抑制可能含來源秘密的原始子程序輸出。

workspace 從共同根目錄安裝一次；子目錄會往上尋找擁有 `yarn.lock` 與 workspaces 宣告的根目錄，不越過 Git 邊界。有子目錄獨立鎖檔或矛盾的管理器宣告時會拒絕。掃描仍使用輸入的 projectPath，因此要涵蓋整個交付產品，請直接指定共同根目錄。

不額外強制略過所有專案腳本，不切換 PnP／node_modules。Classic PnP、現代 pnpm linker、特殊插件及其他平台尚未實測，不列為已驗證佈局。

## 範例與實測

- [Classic workspace](../examples/yarn-classic-workspace/package.json)：Yarn 1.22.22、node_modules、標準 SHA-1 宣告。
- [現代 workspace](../examples/yarn-modern-workspace/package.json)：Yarn 4.18.1、PnP、標準 SHA-224 CLI 宣告；改為 `nodeLinker: node-modules` 也已實測。

YAML 與 pnpm 範例相同，只需把 `projectPath` 指到上述共同根目錄。本機可執行 `npm run test:smoke:yarn`：Windows x64、Node 24.22.2、cdxgen 13.6.0 三種佈局均產生通過官方 CycloneDX 1.6 Schema 的 6 組件 SBOM，包含 shared/web-product workspace 套件、is-odd 與 is-number 直接／間接依賴及對應圖邊；專案安裝腳本、實際模組載入、錯誤 manifest 的嚴格失敗、未變更的 lockfile／設定均有檢查。成品 adapter 為本機驗證，不代表已測 Azure Agent 發佈、Linux 或 arm64。

**required scope 的已知限制**：上述 Yarn workspace 裡，shared 的開發專用 chalk 5.3.0 被 cdxgen 13.6.0 標記為 `required`，因此三種佈局都會保留它。Task 按規格固定傳入 `--required-only`，不另做自訂排除。這與 npm／pnpm 既有 Vue 範例成功排除開發專用 chalk 的結果不同，不能宣稱 Yarn workspace 已排除所有開發套件或完成實際部署成品核對。

安裝旗標參考：[Classic install](https://classic.yarnpkg.com/lang/en/docs/cli/install/)、[現代 install](https://yarnpkg.com/cli/install)、[Yarn 設定](https://yarnpkg.com/configuration/yarnrc)。
