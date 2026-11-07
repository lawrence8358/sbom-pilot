# 0.1.1 .NET Core 路徑修正驗證

## 根因與修正

`validateConfig` 原本無論環境都對輸入 `realpath` 後要求 `stat.isDirectory()`。Classic 的 `filePath` 瀏覽器允許選檔，使用者選擇有效 `PrimeEagleX.Backend.sln` 即被拒絕。實際檔案的絕對與相對路徑都重現，目錄通過且 environment=dotnet；不是 Node24 或 punycode 警告造成。

.NET Core／Windows .NET Framework 現接受 .sln、.slnx、.csproj、.fsproj、.vbproj，正規化到實體檔案所在目錄。後續安裝、scanner argv/cwd、相對排除與 assets 範圍使用同一根目錄。此為既有目錄遞迴語意的相容輸入，不解析 solution 成員清單；欄位 help、README、日誌及 changelog 皆明示此範圍。JS／合併產品繼續要求目錄。

Task ID、extension ID、major0 不變；package、lock、Task、extension 同步 0.1.1。packaging 測試與 final-smoke 的舊版檔名改從 package.json 取得，避免升版後測到歷史包。

## 本輪實際驗證

- `node node_modules/typescript/bin/tsc; node --test .test-build/test/project-path.test.js`：修正前3項失敗，含原始錯誤；修正後3項全過。
- `npm test`：119/119，無失敗／skip。
- Node20.20.2 執行相同3項路徑回歸測試全過。
- `npm run format:check`、`check:source-comments`（175/175）、`check:source-spacing`（0）、`git diff --check` 通過。
- `npm run test:packaging`：1/1 真實 private/public CLI，版本0.1.1、來源／archive／交付清單／篡改與過期拒絕皆通過。
- 以 LawrenceShen 與已確認 Repo 執行 `npm run packaging:package` 成功；tfx 對 .yaml／.lock 的 MIME fallback 有2項既有提示，不是建置錯誤。
- 正式包109項SHA256全過；Node24.22.1／20.20.2 × dist／實際VSIX，共4組啟動、SDK資源、遮罩、manifest、授權通過。
- 自行核對本次 diff 的格式與規格：未發現未解決項目，未呼叫平行或其他代理。

## 使用者真實專案

`.smoke/18/real-project.mjs` 使用真正封裝內的 handler，cwd=`D:/Project/Git/PEX/PortalBackend`、INPUT_PROJECTPATH=`PrimeEagleX.Backend.sln`，其餘採截圖及預設（Node24.x、Spec1.6、預設排除、授權啟用、無cache、DT關閉）。執行真實工具下載、SDK選擇、各csproj還原及單次掃描，沒有替換 installer／generator／validator。

- handler Node24.22.1；掃描Node24.22.2、cdxgen13.6.0、SDK10.0.101。
- Task succeeded；CycloneDX1.6 Schema通過；267 components；203筆非空 dependsOn records。
- BOM `.smoke/18/PortalBackend.bom.json`；SHA256 `02f93ca8e83a0a49b8e5bd2c507201bf1f6f4bf179cf7420aac2b985513df97e`。
- artifact.upload 指令指向同一有效檔案，檔案仍保留。這是本機 Agent 指令輸出，尚不能當真實 Azure 成品上傳／下載成功。
- 實測包 oWa9c4 的 dist/index.js 與最終 VojLtl 正式包、目前 dist bytes 完全一致；後一次重包只納入 packaging/final-smoke 腳本版本修正。
- PortalBackend 已存在6項來源WIP；沒有修改／提交該專案來源。

## 交付

- `packages/public/LawrenceShen.sbom-pilot-0.1.1.vsix`
- SHA256 `fb05c2f4ec10ed7d28f4cf81f3bc814cab61c7b1f255a249f4881e84eadc5b52`
- `packages/submission/public/LawrenceShen.sbom-pilot-0.1.1-VojLtl`；109項SHA全過。

## Azure／Marketplace

Chrome 原run2732確認Task0.1.0與原錯誤；definition85確認選項／排除與截圖一致、DT關閉、其他歷史步驟皆disabled。Marketplace可使用已登入的個人帳戶看到LawrenceShen管理頁及public SBOM Pilot0.1.0。

使用者回覆可繼續操作Chrome並暫停使用；續接後上傳相同SHA的正式0.1.1。Marketplace經Verifying後顯示正式public0.1.1，上傳與驗證成功。

以definition85既有設定啟動[run2733](https://primeeagle.visualstudio.com/PrimeEagleX/_build/results?buildId=2733)，master78ef08f430dbe940ad9dec1b45139ba3ac7aaaab，Azure Pipelines ubuntu-24.04。沒有改動Pipeline定義／專案路徑／排除／DT或其他步驟。

- 實際Task日誌：Version0.1.1；Task成功1m58s，整個job成功2m3s。
- 真實Node工具冷安裝與.NET SDK10.0.101準備、restore、單次scanner、CycloneDX1.6驗證成功。
- 日誌包含`File upload succeed.`及`Associated artifact 2170 with build 2733`；沒有`##[error]`。
- 成品頁1 published，SBOM/bom.json538KB；已透過Chrome下載到Downloads/bom.json，再複製至`.smoke/18/Azure-run2733.bom.json`。
- 下載檔550,201bytes；以正式validator重新執行CycloneDX1.6 Schema，229組件、173筆非空dependsOn記錄。SHA256 `a7575019cccbb4ce18ba40bc635f2777a11570d7df69a1aa84edc4dc809d7a88`。
- 精簡機器可讀證據`.smoke/18/azure-2733-evidence.json`；完整原始日誌不提交。raw log瀏覽器文字有中文字碼解碼問題，Task UI與下載BOM正常；因此以Task UI與實際BOM檔案驗證中文／格式。

這次證據涵蓋Marketplace正式更新、Azure DevOps Services Classic成功執行、非同步成品上傳與下載。Server／YAML UI、故障傳播、arm64及企業feed環境仍屬其他既有驗收範圍。
