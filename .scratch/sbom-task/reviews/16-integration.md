# 工單16 Marketplace 獨立整合

固定增量基準 `39584bc`，包含素材提交 `a92e6f1`；候選 `c4212ef8ec0bdebbba3a119e8d85213c5a453d61`。已讀 root 審查條件、issue、恢復指引、執行 resume，並核對 own worktree checkpoint、clean status、diff 及 `.smoke/16-marketplace/final-summary.json`。root 從 `5c8c744` 以 no-ff 合併，merge SHA `45058ecf6e8f2503940d83057053dc4046f0ff5c`。

## root 實際驗證

Windows Node24.22.1 序列執行，以下皆 exit0：

- typecheck、format:check、中文用途175/175、spacing0、完整116/116測試。
- `npm run packaging:check -- --preview`、`npm run packaging:preview`、舊 `npm run package:dev`。
- `npm run test:packaging`：真實 CLI 的 private/public 隔離fixture、缺identity早期拒絕、八類來源／dist stale、VSIX tamper、模式錯配、重新build仍拒舊包、VSIX與sidecar hash同改仍拒絕，以及交付SHA256全部通過。合成Publisher只留 `.smoke/marketplace-SYNTHETIC-u10PWk`，未放入root正式packages。
- 新preview與舊dev包分別用 `scripts/verify-package.mjs [--vsix packages/preview/local-dev-placeholder.sbom-pilot-0.1.0.vsix] --node D:/Project/Git/sbom-pilot/.smoke/handlers/node-v20.20.2-win-x64/node.exe --node C:/nvm4w/nodejs/node.exe`；兩種包各四組 dist／VSIX × Node20／24，全過。實測SDK resource/glob/process、秘密先登錄、manifest、licenses、圖示／hero／overview及相對連結。
- 本次preview交付目錄109項 `SHA256SUMS` 逐檔核對成功；`git diff --check 39584bc...HEAD` 通過。tfx僅既有yaml／lock MIME警告。

worker的Windows Node20完整116、Linux Node24完整116及Linux Node20／24 probes亦已讀取；保留版本及平台界線。未重跑Linux、管理器下載或還原矩陣，沒有新增相依或Task runtime來源變動。

## 目前可檢視的預覽

只產生 **LOCAL PREVIEW ONLY**，不猜正式身分：

- 資料夾：`D:/Project/Git/sbom-pilot/packages/submission/preview/local-dev-placeholder.sbom-pilot-0.1.0-1wTIKK`。
- VSIX：`packages/preview/local-dev-placeholder.sbom-pilot-0.1.0.vsix`，3789264 bytes，SHA256 `33d38ff64decd84e8b6adfd950e066c0d4b60b477c9403cc963eccf2865e3b9b`。
- 舊dev VSIX SHA256 `dde40bd8c0871df74ca01feaaabb8c16233a1f7813e09cb17f3a396644af3e27`。
- runtime `dist/index.js` SHA256 `c937caf650b101fd888ece192c7391976da4a3fdb401179e668071e4e9a1388f`，與工單15相同。
- icon SHA256 `b79ab79483f10bb788a89d9138e4101fc946e1201d6e5f59cbb9f6f96060a9df`；hero SHA256 `83e204b28daaa43a885c1f6a194e90de84c003f028f0bb8779377d433f62b58d`，素材未重製，dist/icon與原icon相同。

147個來源輸入與候選對照，26檔只有CRLF／LF差異，無其他內容差異；因此分別保留本機來源收據，沒有把跨checkout原始SHA當成相同。root來源snapshot的JSON SHA256為 `44106f9447ae73098ed80e185504054e2ef210df0827c1366d8c29e239509ab0`。

## 證據與交還

精簡證據在root ignored `.smoke/review-16/`：本次11組檢查日誌、命令／exit／SHA256總表 `final-summary.json`、來源比較 `source-comparison.json`，以及候選summary和Windows／Linux完整性／preview／雙Node probes的6個一般檔案副本；未複製node_modules或symlink。root summary SHA256 `4f547a63e1384b1fcc41fb350f98942b24b91a6f0f68ee015fea0048e8311919`。

Standards有1項P3判斷性清單重複，見 [獨立報告](16-standards.md)。parent已接受待Spec完成後由同一implementer集中修正；merger未自行改產品。此報告不代表Spec已複查，也未將工單16標為完成。

保留root HANDOFF／state／issue／spec雜湊；`16-review-context.md`為parent同步編輯，未納入此次提交。只提交兩份報告，不改派工或checkbox，不清理舊受保護目錄。無遠端上傳、publish、share、push或PR。實際Publisher／公開Repo尚未提供；Services／Server、UI／非同步交付、arm64、企業feeds／Proxy／CA／client certificates仍UNVERIFIED。
