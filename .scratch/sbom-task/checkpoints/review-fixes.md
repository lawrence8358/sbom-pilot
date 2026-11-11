# OSV 失敗門檻 review 修正 checkpoint

- 分支：`ticket/osv-review-fixes`；工作目錄：`D:/Project/Git/sbom-pilot-wt/review`。
- 起始 HEAD：`de62c38845f5d51f41fd5bacd5ace92cd811b8d7`，已包含 `feature/osv-fail-threshold`；開始時工作區乾淨。
- 對照基準：`main`（已檢查 `git diff main...HEAD` 功能範圍）；本輪修正以工作區 diff 呈現。
- 已讀 AGENTS、CONTEXT、OSV spec、24–27 checkpoint、恢復指引與指定 TDD 方法，執行 `node scripts/resume.mjs`；未啟動子代理。

## 逐項完成狀態

1. [x] `osv-report.ts` 的 ratings 為風險順序與中文短標籤唯一來源；匯出 `osvSeverityOrder`、`osvSeverityLabels`，供門檻與 issue 共用，`OsvSeverity` 也由 ratings 推導。Markdown fixture 內容不變。
2. [x] 新增無 SDK 相依的 `logging-command.ts`，集中 `escapeLoggingCommandData` 與 `taskLogIssue`；setsecret 共用跳脫，從 command-log 移出 issue。`src/` 沒有 taskcommand 深層引用；測試仍以 SDK parser 驗證訊息往返。
3. [x] 六個門檻值集中於 `osvFailOnValues as const`，型別及驗證共用。
4. [x] 匯出 `OsvFindingGroups`，partition 與 issue 共用唯讀清單介面。
5. [x] 移除 issue 重排序；workflow 排序測試改由逆序 OSV JSON 經真實 `createOsvReport` 產生清單，驗證六級由高至低、原清單不變。上限測試假資料同步遵守掃描器已排序的介面契約。
6. [x] OSV 區塊僅取一次已驗證的 threshold，分組、錯誤訊息與技術失敗分支共用。
7. [x] 移除 `renderOsvReport` 包裝，測試直接使用 `createOsvReport(...).markdown`，移除原先兩介面互相比對的重複斷言。
8. [x] `osv-threshold.test.ts` 全部測試名稱改為英文，註解及產品訊息維持繁體中文。
9. [x] 先新增空字串、空格與 tab 的公開設定解析測試，確認失敗後，在 `readTaskConfig` 比照 osvVersion 套用預設 unknown；其他非法值仍拒絕。
10. [x] README-Dev 模組表加入 osv-threshold、osv-issues、logging-command，workflow 說明補 OSV 門檻可阻擋 DT。
11. [x] compatibility 移除有弱點只警告的舊描述，補預設門檻與僅警告、技術失敗的 DT 行為。搜尋 docs、README、src/task.json 及其他公開內容，未發現其他未限定條件的舊描述；repo 沒有 marketplace/ 目錄，已核對 docs/marketplace.md。歷史 .scratch 記錄未改，僅修改使用者指定的三個檔案並新增本 checkpoint。
12. [x] release notes 修正「門檻不是僅警告時略過 DT 上傳；設定為僅警告時仍嘗試 DT 上傳」句子。
13. [x] spec 錯誤彙整決策補充：未啟用 DT 時不含「；已略過 DT 上傳」。
14. [x] 工單 26 Comments 補資料區只跳脫 %、CR、LF，以及屬性區分隔字元的說明。

## 驗證

- TDD red：`node node_modules/typescript/bin/tsc` 後，`node --test --test-name-pattern='empty YAML' .test-build/test/osv-threshold.test.js`，1/1 失敗；原因為空字串被門檻驗證拒絕。
- TDD green：同一命令 1/1 通過。
- 受影響測試：`node --test .test-build/test/osv-threshold.test.js .test-build/test/osv-report.test.js`，59/59 通過。
- `npm run typecheck`：通過（exit 0）。
- `npm run format:check`：通過（exit 0）。
- `npm run check:source-comments`：207/207 通過（exit 0）。
- `npm test`：前兩輪各 193/194 通過，唯一失敗均為既有 `concurrent population only leaves a verified usable cache` Windows EPERM rename；未改快取程式或測試。
- 第三輪完整 `npm test`：194/194 通過（原 193 + 新增 1），0 失敗、0 略過（exit 0）。
- `git diff --check`：通過。

## 交還與限制

- 所有驗證程序已結束，沒有待續讀的 session；暫存完整測試 log 已移除，只保留本 checkpoint 的精簡結果。
- 所有變更保留未 staged，未執行 git add／commit／merge／push。由協調者審查、提交及整合。
- 未安裝或修改 node_modules junction，未改其他 worktree、主 repo 或差異/。
- package:dev／test:package 按使用者指定由協調者在主 repo 驗證，本輪未執行打包。
- 真實 Azure 結果頁呈現仍待實機驗證，本輪只驗證本機行為與既有測試。
