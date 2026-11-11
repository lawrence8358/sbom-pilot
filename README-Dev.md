# SBOM Pilot 開發

使用 Node.js >=24 與 npm，先執行 npm ci。產品使用方式與所有公開參數見 [README](README.md)。

## 建置與驗證

~~~powershell
npm ci
npm run typecheck
npm run format:check
npm run check:source-comments
npm run check:source-spacing
npm test
npm run test:packaging
~~~

npm test 編譯測試並檢查凍結安裝、還原範圍、認證隔離、掃描、Schema、DT、命令遮罩與錯誤傳遞。test:packaging 在隔離目錄實際建立私有／公開 VSIX，驗證 0.3.2 的 package／lock／Task／extension 版本一致、公開文件契約、身分、payload、來源新鮮度與竄改拒絕。

真實工具測試依改動選擇 test:smoke、test:smoke:osv、test:smoke:pnpm、test:smoke:yarn、test:smoke:dotnet、test:smoke:framework、test:smoke:combined、test:smoke:npm-auth、test:smoke:nuget-auth。這些會下載並執行真實工具；一般測試不自動改寫專案鎖檔。OSV smoke 使用官方 latest（可用 OSV_SMOKE_VERSION 指定）、真實 API、有弱點／無弱點 SBOM、自訂檔名與快取重用，證據在 .smoke/21；其他既有 smoke 明確關閉 OSV，避免將新增外部連線混入原測試範圍。

npm run package:dev 建立本機測試 VSIX；npm run test:final -- --cases=npm,artifact-failure 解包後執行真實 handler，驗證 DT 成功／失敗、同份成品、階段日誌與成品 adapter 故障。正式包可加 --vsix=packages/public/LawrenceShen.sbom-pilot-<version>.vsix 驗證同一個出貨檔案。npm test 與 final harness 共用 .test-build，不可同時執行。

## 程式入口

| 檔案 | 責任 |
| --- | --- |
| src/task.json、config.ts、azure-inputs.ts | 公開欄位、解析、驗證與秘密讀取 |
| src/index.ts、workflow.ts | Azure adapter、依序執行各階段、OSV 失敗門檻可阻擋 DT、DT 失敗仍發佈有效成品 |
| src/tools.ts、node-cache.ts | Node 校驗與快取、隔離 cdxgen 安裝 |
| src/osv.ts、osv-report.ts | 官方 Latest 解析、校驗與版本快取、單次 JSON 掃描、風險分級／CVE Markdown 報告 |
| src/osv-threshold.ts、osv-issues.ts | OSV 失敗門檻驗證與弱點分組、逐筆 Errors／Warnings issue 及數量上限 |
| src/logging-command.ts | 共用 Agent logging command 資料跳脫與 issue 指令建立 |
| src/install/、dotnet/ | 嚴格安裝、還原圖、SDK／MSBuild、來源認證 |
| src/scan.ts、validation.ts | 單次掃描與隨附 CycloneDX Schema 驗證 |
| src/dt/、network/、process.ts | DT REST、Proxy／CA、程序與錯誤隔離 |

依賴與掃描使用 shell:false；秘密在 SDK 載入前註冊遮罩。不要將原始子程序輸出或認證記入日誌。根目錄 CONTEXT.md 與 docs/adr 記錄領域與產品邊界。

## 打包與發版

參閱 [Marketplace 操作](docs/marketplace.md)。0.3.2 的 Task 與擴充套件版本需同步更新 package.json、package-lock.json 根版本、src/task.json 與 vss-extension.json，封裝測試會核對來源與 VSIX 版本一致。保留 Task GUID、名稱與既有輸入；major 決定 YAML 的 SbomPilot@0。發版說明記於 `.scratch/full-sbom/release-notes-0.3.1.md`、`.scratch/full-sbom/release-notes-0.3.2.md`。

README.md 是唯一市集介紹，圖片使用 GitHub raw HTTPS，文件連至 GitHub 絕對網址。VSIX 只包含 dist、README、圖示及 manifest 需要的 LICENSE；開發文件與範例留在 GitHub。THIRD-PARTY-NOTICES.md 與完整 runtime 授權必須保留，建置會複製至 dist。

scripts/packaging-state.mjs 記錄來源與 dist 雜湊；來源改動後重新 build/package，禁止沿用失效收據。scripts/verify-package.mjs 支援 --vsix <path> 與重複 --node <absolute-node-path>，核對 dist／VSIX 與雙 handler 實際入口。Node20 測試執行檔可由 node scripts/acquire-handler.mjs 20 取得並校驗。

版本變更與驗證結果記在 Git commit／GitHub Release，不另維護重複 CHANGELOG。驗收區分本機、容器與 Azure 實際工作；沒有測到的環境不可推定通過，參閱 [相容性](docs/compatibility.md)。
