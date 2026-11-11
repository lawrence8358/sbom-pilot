# 完整 SBOM code review 修正清單（feature/full-sbom，基準 55b7046）

不改：完整 SBOM 檔名 `-dev.json`（使用者決定）；scripts/build.mjs 的封裝身分注入；src/osv-tab/load.ts 的附件連結驗證。

## Standards
1. src/workflow.ts：以帶 variant（DtSbomVariant 'product'|'full'）與中文 label 的描述物件取代 `sboms[0]/[1]`、`reports[0]/[1]` 與 `index === 0 ?` 分支；DT 依 variant 取用。
2. src/workflow.ts：developmentExtraFindings 只計算一次，供 issue 與頁籤附件共用。
3. 完整 SBOM 檔名推導與「不可與產品同名」檢查移到 src/config.ts（validateConfig 產出 fullSbomFileName 或共用函式），workflow 只取用。
4. 成品發佈 stage 標示 `成品發佈（產品 SBOM）`／`成品發佈（完整 SBOM）`；OSV 報告成品發佈同樣標示。
5. src/osv.ts 的 `variant?: 'product' | 'full'` 改用共用的 DtSbomVariant（或抽一個 SbomVariant 共用型別）。
6. 嚴重度順序、中文標籤、門檻值由 src/shared/osv-tab-contract.ts（或單一共用模組）以 as const 陣列匯出並推導型別；src/osv-report.ts、src/osv-threshold.ts、src/osv-tab/render.ts、src/osv-tab/validate.ts 改為引用，不再各自重寫。頁籤 bundle 不可因此引入 Node 專用模組。
7. 契約欄位 `devExtra` 改名 `developmentExtra`（尚未發佈，schemaVersion 維持 1），Task 端、頁籤、測試、fixture、工單 35 契約區塊同步。
8. src/osv-issues.ts 改為接收已計算好的開發套件識別集合（或已標記的 finding），不自行計算差集來源。
9. src/index.ts 的 publishTabReport 不使用 `tempDirectory!`：由 workflow 傳入輸出路徑或以參數提供。

## Spec
10. docs/compatibility.md:38、docs/combined.md:3 改寫：兩份 SBOM、兩份中文檔名 OSV 報告、「OSV 弱點報告」頁籤，移除 uploadSummary／Extensions／sbom.osv.md 描述。全文搜尋 docs/ 其他殘留。
11. src/task.json 的 dtSbomVariant helpMarkDown 補「選產品 SBOM 可維持 0.3.0 以前只上傳產品內容的行為」。
12. README.md 第 12 步移除「（有完成報告時）」，說明未啟用 OSV 時也會上傳標示未執行的附件。
13. 頁籤判定行：產品 SBOM 掃描失敗但完整 SBOM 已完成且 exceeded=true 時，仍顯示「超過失敗門檻『X』」，並另註明產品 SBOM 掃描失敗；加 DOM 測試。
14. 產品 SBOM OSV 失敗時，issue 輸出額外記一行警告「產品 SBOM 弱點掃描失敗，無法區分開發套件額外弱點」，弱點訊息不標為開發套件；加 workflow 測試。

全部完成後 typecheck、npm test、format:check、check:source-comments、check:source-spacing、test:packaging 皆須通過。
