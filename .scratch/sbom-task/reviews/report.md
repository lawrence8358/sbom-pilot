# 最終程式碼審查與修正結果

初次比較固定為 `e3a5bf6ed57b74c519d0d64285f2929d0195688b...8b6969ded4884cb0a4d759dc70aabb2e246715dd`；[提交清單](commits.txt)與[審查條件](review-context.md)保留。依使用者要求，兩軸與後續實作、合併、複查均序列執行，一次一位子代理。修正合併 `c831001`，固定複查產品 `917afff`；原始發現不以修正後狀態覆寫。

## Standards

初次報告：[standards.md](standards.md)。明確標準違反：

- **P3：用途註解與實作不符。** `src/tool-options.ts:22` 寫「核對實際套件名稱、版本與 Node engines」，但 `validateCdxgenPackage` 的參數與判斷皆沒有套件名稱。依 README-Dev 與工單13的用途說明要求，應修正註解，避免維護者誤以為這裡已驗證名稱。

判斷性維護建議，非硬性違規：

- **Duplicated Code：鎖檔政策清單重複。** `src/install/project.ts` 與 `src/install/javascript-projects.ts` 重複六種檔名，例如 `npm-shrinkwrap.json`、`bun.lockb`；建議共用候選清單，各自保留探索／衝突語意。
- **Duplicated Code：assets 完整性判定出現差異。** SDK 與 Framework 都驗證 targets、libraries、project.restore.projectPath，前者另外檢查 object，後者僅檢查 truthiness；建議共用結構判定，保留路徑診斷與 Framework nupkg 檢查。

**結案：3項均已修正。** 原審查者核對註解與實作一致、唯讀 lockCandidates 共用、兩還原路徑採用 validRestoreAssets；[修正複查](standards-recheck.md)保存證據。初次1項 P3硬性違反、2項判斷性建議，目前未結案0項。

## Spec

初次報告：[spec.md](spec.md)。發現1項 P2：

- **並行冷啟動可能誤判完整 Node 快取為損壞。** 規格要求「以單一 Task 完成一般工具準備」（需求規格:14）。另一工作在首次 complete() 後完成原子發佈時，舊流程只檢查外部 legacy marker；新格式標記位於目錄內，因而要求清理其實完整的快取。受控交錯探針已重現。應重新檢查新格式標記並驗證勝出快取，補上回歸測試。

其餘初次檢查未發現可確認的功能缺漏或未授權擴張。

**結案：原 P2已修正，未發現新增實際缺陷。** 由不同於修正實作者的代理核對新格式 winner 重驗、永久／暫時錯誤邊界與回歸；[功能複查](spec-recheck.md)保存結果。初次1項 P2，目前未結案0項。

## 協調查核與驗證

[協調查核](coordinator-findings.md)另列正式打包 URL 驗證過寬與已觀察的 Windows EPERM，不併入兩軸初次數量。兩者已修正：正式 URL 拒絕不完整／佔位／帳密；Windows rename 限定錯誤與目的地條件、有界五次，保留不完整目的地、永久錯誤及自己的 staging 清理。原 EPERM 原因仍未知，不宣稱取得 handle／防毒診斷。

Windows/Linux、Node20/24各108項測試，170項中文具名說明、格式、型別、建置與真正解包 VSIX 檢查通過。受影響 Windows/Linux 冷Node與私有 NuGet／Framework 真實流程、DT403仍保留相同有效成品通過。[工單14檢查點](../checkpoints/14.md)記錄命令／hash；[獨立整合驗證](14-integration.md)記錄最終套件。Linux本次SDK預裝，先前無SDK冷取得證據另保留於工單12/13，不混同。

實際 Publisher／公開 Repo、live Services／Server、Classic／YAML UI、成品下載與 Agent非同步失敗傳播、arm64及企業網路／來源仍未驗收。這些是外部驗收邊界，不冒充本機通過或尚存程式缺陷。

Standards：初次3項（最嚴重P3，另2項判斷建議）→未結案0項；Spec：初次1項（最嚴重P2）→未結案0項。
