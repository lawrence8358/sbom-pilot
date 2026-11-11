# 完整 SBOM code review 修正 checkpoint

## 工作範圍與起始確認

- 日期：2026-11-11；worktree：`D:/Project/Git/sbom-pilot-wt/34`。
- 分支：`ticket/34-full-sbom-release`；起始 HEAD：`51b4370`。
- `git status --short`：起始輸出為空，工作樹乾淨。
- `git merge-base --is-ancestor feature/full-sbom HEAD`：exit 0。
- 已讀 AGENTS.md、CONTEXT.md、ADR 0003、完整 SBOM 規格、review-fixes.md、implementation-resume、HANDOFF 與工單 34 checkpoint；`node scripts/resume.mjs` 成功。
- 依使用者授權處理 1–14；未 stage／commit／merge／push，未連外，未修改 node_modules junction、主 repo、`差異/`、`範例/`。
- 保留既有 `-dev.json` 檔名、build 身分注入與附件連結驗證。

## 逐條結果

1. 完成：workflow 以包含 `DtSbomVariant`、中文 label、SBOM 與可選 OSV 報告的描述物件取代數字索引；DT 依 variant 選取描述物件。
2. 完成：`developmentExtraFindings` 在 workflow 僅呼叫一次，結果供 issue 識別集合與頁籤附件共用。
3. 完成：`validateConfig` 推導並回傳 `fullSbomFileName`，同名檢查在參數驗證階段執行，workflow 僅讀取結果。
4. 完成：SBOM 成品與 OSV 報告發佈錯誤階段皆標示「產品 SBOM」或「完整 SBOM」；更新錯誤彙整斷言。
5. 完成：`OsvScanRequest.variant` 引用共用 `DtSbomVariant` 型別。
6. 完成：共用契約以 `as const` 的 `osvRatings`、`osvFailOnValues` 推導型別，集中嚴重度順序、中文標籤與門檻；報告、門檻判定、頁籤渲染與驗證皆引用。共用模組無 Node 相依，頁籤封裝通過。
7. 完成：契約欄位改為 `developmentExtra`，schemaVersion 仍為 1；同步 Task、頁籤、測試內 fixture 與工單 35 契約，並校正工單門檻型別排除 none 的描述。
8. 完成：`logOsvIssues` 接收 `ReadonlySet<string>` 的已計算開發套件識別集合，不再自行從差集清單建立集合。
9. 完成：workflow 將附件輸出路徑作為 `publishTabReport` 第二參數，index 不再使用 `tempDirectory!`；adapter 假服務同步新介面。
10. 完成：compatibility、combined 改為兩份 SBOM、兩份中文檔名報告及「OSV 弱點報告」頁籤，更新附件與技術失敗說明。全文搜尋 docs 無舊 sbom.osv.md、uploadSummary／uploadsummary 或 CI 摘要描述；Microsoft.Extensions 套件名稱保留。
11. 完成：Task 的 dtSbomVariant 說明補上「選產品 SBOM 可維持 0.3.0 以前只上傳產品內容的行為」。
12. 完成：README 第 12 步明示未啟用 OSV 時也會上傳標示未執行的附件。
13. 完成（TDD）：新增 DOM 測試，產品掃描及差集狀態 failed、完整 SBOM exceeded=true 時，判定行保留「超過失敗門檻『高』」，另註產品 SBOM 掃描失敗，不宣稱無法判定完整結果。
14. 完成（TDD）：擴充 workflow 測試；產品 OSV 失敗時額外輸出一次 warning issue「產品 SBOM 弱點掃描失敗，無法區分開發套件額外弱點」，完整 SBOM 弱點 issue 不標示開發套件；一般與僅警告門檻的既有技術失敗斷言同步更新。

## TDD 證據與回歸

- 採完整規格已指定的 DOM 與 workflow 假服務公開測試切面。
- 第 13 項 Red：編譯後執行 `node --test --test-name-pattern="product scan failure preserves" .test-build/test/osv-tab.test.js`，1 failed；實際判定為「掃描失敗，無法判定完整結果」，缺少超標文字。
- 第 13 項 Green：修正判定行後，同一命令 1 passed、0 failed。
- 第 14 項 Red：編譯後執行 `node --test --test-name-pattern="failed product comparison" .test-build/test/osv-threshold.test.js`，1 failed；指定警告筆數實際 0、預期 1。
- 第 14 項 Green：新增警告後，同一命令 1 passed、0 failed。
- 全套回歸曾指出兩個舊測試仍要求技術失敗時完全沒有 issue，已更新為指定 warning；另 adapter fixture 原介面未傳輸出路徑，已同步新參數。最終全套通過。

## 最終驗證命令與輸出摘要

- `npm run typecheck`：exit 0，`tsc --noEmit` 無錯誤。
- `npm test`：exit 0，tests 254、pass 254、fail 0、skipped 0。
- `npm run format:check`：exit 0，`All matched files use Prettier code style!`。
- `npm run check:source-comments`：exit 0，`243/243 named functions/callables documented.`。
- `npm run check:source-spacing`：exit 0，`0 missing gaps.`。
- `npm run test:packaging`：exit 0，tests 2、pass 2、fail 0；合成身分 private/public VSIX 建置、封裝檢查及失效／竄改拒絕測試通過。
- `git diff --check`：exit 0，無 whitespace error。
- 搜尋確認：src／test／工單 35 契約無 devExtra；workflow 無 sboms[0/1]、reports[0/1]、index === 0，差集呼叫僅一處；docs 無舊 OSV 報告檔名與摘要上傳描述。
- 未執行 Azure DevOps／DT／Marketplace 實機驗收，本次驗證全在本機執行。

## 修改檔案

- 程式：`src/config.ts`、`src/index.ts`、`src/workflow.ts`、`src/osv.ts`、`src/osv-report.ts`、`src/osv-threshold.ts`、`src/osv-issues.ts`、`src/shared/osv-tab-contract.ts`、`src/osv-tab/render.ts`、`src/osv-tab/validate.ts`、`src/task.json`。
- 測試：`test/full-sbom.test.ts`、`test/osv-tab-attachment.test.ts`、`test/osv-tab-host.test.ts`、`test/osv-tab-load.test.ts`、`test/osv-tab.test.ts`、`test/osv-task-adapter.test.ts`、`test/osv-threshold.test.ts`。
- 文件：`README.md`、`docs/combined.md`、`docs/compatibility.md`、`.scratch/sbom-task/issues/35-osv-tab-frontend.md`、本 checkpoint。

建議 commit 訊息：`fix(full-sbom): 修正掃描失敗判定並整併雙份 SBOM 契約`
