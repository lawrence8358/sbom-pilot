# Standards 修正複查

複查原報告 [standards.md](standards.md) 的三點，對象為工單 14 候選 `30a2caec244daa800b3a9c61479332253d71138c` 及整合提交 `c8310016f4b975a84cd7cfa83a1701db813d5f5b`。本次只核對既有發現，不進行新一輪 Spec 審查或修改產品程式。

- **用途註解：已修正。** `src/tool-options.ts:22` 現在只聲明驗證實際版本與 Node engines，與 `validateCdxgenPackage` 實作一致，不再假稱已驗證套件名稱。
- **鎖檔清單重複：已修正。** `src/install/project.ts:91` 公開唯讀 `lockCandidates`；`src/install/javascript-projects.ts:8` 匯入同一清單，於 workspace 子鎖檔判定使用，原有各路徑診斷保留。
- **assets 判定重複：已修正。** SDK 與 Framework 還原都呼叫 `src/dotnet/assets.ts:10` 的 `validRestoreAssets`。共用檢查拒絕 null、陣列、純量及缺失／錯誤的專案身分；各還原診斷、既有鎖檔保留及 Framework nupkg 檢查仍在原路徑。

原 Standards 三點均可結案。整合後 108/108 測試、typecheck、格式及 170/170 中文用途說明檢查通過；精確封裝與命令證據見 [14-integration.md](14-integration.md)。外部環境驗收不屬於本次 Standards 結論。
