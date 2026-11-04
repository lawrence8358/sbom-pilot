# 工單15 日誌安全修正獨立整合

候選 `8993b98c13498d77018ead271afd0edc125d7950`，產品基準 `7ddf4a09871ad90e0f1688f4199bc51b62ea17ed`；整合前 root 為 `1f550a7`。已讀恢復指引、執行 `node scripts/resume.mjs`，並核對安全 worktree 的 checkpoint、clean status、完整六檔 diff 與既有日誌。以 `git merge --no-ff ticket/15-command-log-safety` 整合，merge SHA `c19b354537dff8fc1b4bb3e35c71a322f1d30c0b`。

修正將共用 `diagnosticJson` 的 `#` 輸出為 JSON Unicode escape，兩項回歸涵蓋真實 console、各顯示欄位、秘密遮罩、控制字元、JSON 還原及原 Command 物件不變。依賴鎖檔、秘密模組第一載入及執行政策未變。此次為整合與 Standards 增量核對，Spec 另由獨立 reviewer 複查。

## 整合分支實測

全部序列執行，未重裝相依、下載管理器或重跑真實還原矩陣：

- Node24.22.1：typecheck、format:check、中文用途175/175、spacing0；`npm test` 116/116；`npm run package:dev` 含 build 成功。
- Node20.20.2：以絕對 handler 路徑、PATH 前置其目錄及既有 npm CLI 執行 `test`，116/116；直接執行 `scripts/build.mjs` 與 `scripts/package.mjs --local` 成功。
- 以 `node scripts/verify-package.mjs --node D:/Project/Git/sbom-pilot/.smoke/handlers/node-v20.20.2-win-x64/node.exe --node C:/nvm4w/nodejs/node.exe` 通過 dist／VSIX × Node20／24 四組隔離探測；包含真正 SDK resource/glob/process、秘密先登錄、manifest、licenses 及文件連結。
- `git diff --check 1f550a7..HEAD` 通過；tfx 僅既有 yaml／lock MIME 警告。

Linux 未重跑；已獨立讀取並保存候選 Node24.22.2 command-log／DT 18/18 日誌。這不是 Linux 本次 full116。歷史真實管理器矩陣保留原版本界線。

## 證據與產物

root ignored `.smoke/review-15-safety/index.json` 記錄十組檢查命令、exit0、日誌 SHA256、三份候選精簡日誌來源及 SHA256。候選僅複製 `regression-green.log`（8/8）、`final-package-probes.log`（四組）、`linux-targeted-node24.log`（18/18），不搬相依或完整環境。

index SHA256：`48b32e624536a1ec7e0fa2c7e4fc8d1f7d34884b6d0a92d31bc387ad3e672441`。

- root `dist/index.js`：991881 bytes，SHA256 `c937caf650b101fd888ece192c7391976da4a3fdb401179e668071e4e9a1388f`；與候選 runtime 完全一致。
- root 開發 VSIX：447599 bytes，SHA256 `4f61e11fa04c3757e909051b5eb2c33885d8f47ba01d423d7f2f04940e29fe7a`。本次重建 ZIP 雜湊與候選包不同；隔離探測另確認 VSIX handler 與當前 dist 位元組相等。

## WIP 與交還界線

整合前及 merge 後第16張 spec、issue、checkpoint 與 images 共7檔 SHA256 相同。驗證末期僅 issue16 出現協調者同步更新；parent 明確確認是把驗證基準114改成116，已保留現值；其餘6檔不變。快照留在同目錄 `wip-before.json`／`wip-after.json`。此次只提交兩份審查報告，不提交16準備 WIP、不改 root 派工狀態，不清理受保護 temp／殘留，無 push／PR。

獨立 Standards 安全增量為0項，見 [複查報告](15-standards-safety-recheck.md)。真實 Azure Services／Server 安裝、UI、非同步成品下載／失敗傳播、公開 Publisher／Repo、arm64 與企業 feed／Proxy／CA／client certificate 仍未驗收。
