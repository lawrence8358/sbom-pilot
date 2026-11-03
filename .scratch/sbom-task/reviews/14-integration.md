# 工單 14 整合驗證

- Root：`D:/Project/Git/sbom-pilot`，`feature/sbom-pilot`；合併前乾淨 `da636e7f0fe78b6f6b36daa2314f671f087ab51e`。
- 候選：`30a2caec244daa800b3a9c61479332253d71138c`；以 `git merge --no-ff` 合併，無衝突，產生 `c8310016f4b975a84cd7cfa83a1701db813d5f5b`。
- 合併後與候選的產品樹完全一致；差異僅 root 原有 HANDOFF、coordinator、implementation-state。本次另新增兩份審查／驗證紀錄，不修改派工、progress、規格或其他產品程式。
- README-Dev 候選已移除多餘 EOF 空白行；root 核對僅保留一個 CRLF 檔尾換行，無須再改寫。最後以此份文件重建 VSIX。
- `package.json`／`package-lock.json` 與合併前一致，沿用前次已完成 npm ci 的 node_modules；未進行不必要的相依重裝。

## 本次實際執行

以下命令均於 root 成功退出（exit 0）：

```powershell
npm run typecheck
npm run format:check
npm run check:source-comments
npm test
npm run package:dev
npm run test:package -- --node D:/Project/Git/.sbom-pilot-worktrees/11-compat/.smoke/handlers/node-v20.20.2-win-x64/node.exe --node C:/nvm4w/nodejs/node.exe
```

- 完整測試 **108/108**，中文具名函式／callable 說明 **170/170**；格式與型別通過。
- package:dev 包含 build／typecheck。tfx 僅有既有 yaml／lock MIME 警告，不影響封裝。
- Windows Node20.20.2 與 Node24.22.1 的 isolated dist／真正 VSIX 入口各通過，包含 startup、秘密遮罩、SDK 資源、manifest、授權與文件連結檢查。
- `git diff HEAD^ HEAD --check` 通過。first secret import、sourceRoot／實體暫存安全、鎖檔／assets／nupkg、單次掃描、DT 與真實 runtime 告示均來自與已驗證候選相同的產品位元組，未另行修改。

## Root 最終開發套件

- 路徑：`packages/local-dev-placeholder.sbom-pilot-0.1.0.vsix`（忽略產物）。
- 大小：**443939 bytes**。
- SHA-256：`110e443bcc9cfb8e3fa0f974d05939b18db3fc736033f9660df1cbb88eb91e26`。

## 保留證據與邊界

已將工單 worktree 的 `14-windows-evidence.json`、`14-linux-evidence.json`、`14-windows-node20-tests.log`、`14-linux-node20-tests.log`、`14-linux-tests.log` 複製到 root 忽略目錄 `.smoke/review-14/`，逐檔核對 SHA-256 相同。本次 root 測試日誌另存 `14-integration-tests.log`；均不提交大型日誌或秘密。

既有 Windows／Linux Node20／24 完整測試及受影響冷 Node／NuGet／Framework 真實流程由 checkpoint14 記錄，本次不重跑未變更的下載矩陣。Linux 本輪 SDK 預裝與先前冷 SDK 證據保持區分；本機 adapter 不代表 live Azure 發佈驗收。原 Windows EPERM 的原因仍未知，工單新增有限重試與受控回歸不等於已取得 handle／防毒診斷。

沒有活動命令／session；沒有新增 Docker 執行，既有 exited 容器／volume 保留。未觸碰 `C:/Users/lawrence/AppData/Local/Temp/sbom-final-GP4o3T`。未 push／建立 PR。實際 Publisher／公開 Repo、live Services／Server、企業來源／網路及 arm64 仍維持外部未驗收狀態。
