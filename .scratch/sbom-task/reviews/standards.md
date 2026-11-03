# Standards review

比較：`e3a5bf6...8b6969d`。審查：explore_restore，唯讀。以下為初次報告，尚待集中修正。

明確標準違反：

- **P3：用途註解與實作不符。** `src/tool-options.ts:22` 寫「核對實際套件名稱、版本與 Node engines」，但 `validateCdxgenPackage` 的參數與判斷皆沒有套件名稱。依 `README-Dev.md:21` 與工單 13:13 的用途說明要求，應修正註解，避免維護者誤以為這裡已驗證名稱。

判斷性維護建議（非硬性違規）：

- **Duplicated Code：鎖檔政策清單重複。** `src/install/project.ts:90` 的 `lockCandidates` 與 `src/install/javascript-projects.ts:18` 的 `lockNames` 都列出相同六種檔名，例如 `'npm-shrinkwrap.json'`、`'bun.lockb'`。新增競爭鎖檔類型時須同步修改，否則單專案與 combined workspace 的衝突判定可能分歧。建議共用候選清單，由呼叫端保留各自判斷。
- **Duplicated Code：assets 完整性判定已出現差異。** `src/dotnet/restore.ts:174` 與 `src/dotnet/framework.ts:230` 都驗證 `targets`、`libraries`、`project.restore.projectPath`；前者另外檢查 `typeof ... === 'object'`，後者僅檢查 truthiness。建議共用 assets 結構判定，保留各路徑的診斷文字與 Framework 專屬 nupkg 檢查，避免日後修補遺漏其中一路。

未發現其他明確標準違反；小型管理器 adapter 與既有測試注入介面具有實際責任，未列為 Middle Man 或 Speculative Generality。全程唯讀，未修改檔案或重跑測試。
