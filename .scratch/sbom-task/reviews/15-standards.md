# 工單 15 增量 Standards 審查

固定比較：`git diff d296f56...87597bf462de8f5b0232cc7ed3c12f6648ff6246`。依 AGENTS、CONTEXT、ADR、README-Dev、工單15及來源格式規則審查；只做 Standards 軸，不讀取或代替另一軸的報告。

## 硬性規範

- **P3：責任區塊註解與實作不符。** `src/install/npm-auth.ts:330` 新增「先核對實體來源邊界，再建立只有本次安裝可使用的認證目錄」，但所在的 `checkProjectAuthentication` 只讀取設定並驗證認證優先序／映射，不呼叫實體邊界判斷或建立暫存目錄。真正的責任在 `withNpmAuthentication` → `authenticationDirectory`。依 `README-Dev.md:23` 與工單15的責任分段及有意義中文說明要求，應將此句改為實際的預檢用途，避免維護者誤認此階段已完成暫存邊界保護。merger 沒有自行修改此產品註解，留待唯一實作者修正。

## 判斷性建議

- **可能的 Duplicated Code。** `src/command-log.ts:110、138、145` 三次列出同一秘密旗標片段 `api[-_]?key|password|passwd|token|access[-_]?token|client[-_]?secret|_authToken|_auth`，分別處理字串內聯、獨立旗標與整個 argv 指派。新增旗標時容易漏改其中一處；可考慮共用旗標名稱模式、保留不同的邊界規則。這是維護性建議，非現有功能缺陷或硬性違規。

其餘未發現需修改的 Standards 問題。函式／實際責任區塊的空白行與中文用途可讀；命令 wrapper 保留 `run(command)` 原物件，沒有增加 shell 或變更原 argv，抽象大小符合單一診斷責任。Task manifest 已改為通用 JavaScript／TypeScript，沒有 Vue 套件前提。工具已強制的格式、175項說明與間距檢查不重列為人工發現。
