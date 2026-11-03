# 工單 15 整合驗證

- Root `D:/Project/Git/sbom-pilot`／`feature/sbom-pilot`，合併前乾淨 `75ecc15`。
- 候選 `87597bf462de8f5b0232cc7ed3c12f6648ff6246`，以 `git merge --no-ff` 無衝突合併於 `f1a0a5ff66f73f511a104dc8c43f14a778eca5f3`。
- 剛合併時產品樹與候選完全一致；差異只有 root 原有 `.scratch/sbom-task/implementation-state.json` 與 `reviews/15-review-context.md`，未覆寫派工文件。
- 經 root 追加授權，只移除 README.md 的多餘 EOF 空白行與 `scripts/check-source-comments.mjs:61` 的尾端空白。修後與候選的產品差異只有這兩處；`git diff --ignore-blank-lines --ignore-space-at-eol 87597bf -- src scripts README.md README-Dev.md package.json package-lock.json` 為空。`git diff d296f56 --check`（含工作樹）通過。
- package-lock 及依賴版本未變，沿用 root 已完成 npm ci 的相依安裝，本次不重新安裝。

## 本次實際命令與結果

```powershell
npm run typecheck
npm run format:check
npm run check:source-comments
npm run check:source-spacing
npm test
npm run package:dev
npm run test:package -- --node D:/Project/Git/sbom-pilot/.smoke/handlers/node-v20.20.2-win-x64/node.exe --node C:/nvm4w/nodejs/node.exe
```

全部 exit 0：typecheck／格式通過，中文用途 **175/175**，函式間距 **0 missing gaps**，完整測試 **114/114**。兩處純空白修正後，另重跑中文用途及間距檢查通過，最後 package:dev 包含 build／typecheck。tfx 僅顯示既有 yaml／lock MIME 警告。

Windows Node20.20.2 與 Node24.22.1 的隔離 dist／真正 VSIX 四個入口檢查全通過，包含啟動、秘密遮罩、SDK 動態資源／程序、manifest、授權及文件連結。本次沒有同時執行 full tests 與 final-smoke，也沒有重跑未變更的真實下載矩陣。

## Root 套件與 runtime

- VSIX：`packages/local-dev-placeholder.sbom-pilot-0.1.0.vsix`，**447099 bytes**。
- VSIX SHA-256：`e7ed6b447861c03dc555ce8e1c9a3d356175a646bb7cc8dc4a58852f5c42bb03`。
- `dist/index.js` SHA-256：`0d9831e7236ca1456f3cc5fb3832f3a684eafe4f84c5d9956deada51ebc3aa9e`，與 checkpoint15 已驗證的 Windows／Linux runtime 完全一致。
- Node20 handler 從本工單已驗證官方目錄複製至 root `.smoke/handlers/node-v20.20.2-win-x64/node.exe`，逐位元組雜湊吻合；SHA-256 `56c1520ee33b801e8bdb92fb321cf2e98529735b6d12bd4a2a6dec0ac0bab937`。不再依賴已清理的工單11，也沒有重新下載。

## 審查與證據保存

本次增量 Standards 報告在 [15-standards.md](15-standards.md)：一項 P3 責任註解不符及一項非強制的重複旗標模式維護建議。P3 已交回 root，依指示保留原始報告並等待唯一實作者修正，merger 不自行改註解。另一軸的獨立複查由 root 接續；本紀錄不宣告工單審查結案。

已複製 **27 個一般證據檔案** 到 root 忽略目錄 `.smoke/review-15/`：最終摘要、八個 Windows／Linux Node20／24 情境目錄的 evidence.json 與去 setsecret 工作日誌，以及四份平台完整測試日誌。逐檔比對原檔 SHA-256；清單在 `copied-sha256.json`。沒有遞迴複製快取或 symlink／reparse point。另保留本次 `15-integration-tests.log` 與少量已遮罩的實際 command／HTTP 範例 `command-examples.log`。

既有 Angular npm／Yarn PnP／原生 pnpm12、私有 combined／DT403 真實結果保持 checkpoint15 的平台、handler 與套件版本界線；本機 artifact adapter 不等於 live Azure 完成。沒有更動第一個 secret import、原始 Command／argv、認證來源／physical sourceRoot、鎖檔、assets／nupkg、ESM alias、單次掃描、DT失敗後有效成品或25筆runtime告示。

本次所有工具 session 均已完成；未啟動 Docker 工作。worker 原有 `sbom-pilot-15-linux` 仍為保留證據的 idle 容器，其他 exited 容器／volume 保留。未觸碰舊受保護殘留或診斷 temp，未 push／建立 PR。實際 Publisher／公開 Repo、live Azure、arm64及企業環境仍未驗收。
