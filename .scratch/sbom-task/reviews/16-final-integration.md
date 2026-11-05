# 工單16 最小修正獨立整合

候選 `b231a690ec2a46b12c2f1decb89a29f8efdab940`，增量基準 `c4212ef`。已讀恢復指引、執行resume，核對own checkpoint最新段、clean狀態、`standards-summary.json`及三檔產品diff：共用來源清單與Bash設定範例。root從 `626fe0f` no-ff合併，merge SHA `f70fe2b343d0a28992876c7f9e613b22c3b32c37`。

只有checkpoint16新增段落的位置衝突；保留worker最新修正／驗證段與root既有額度交接內容，產品檔案無衝突。HANDOFF、state、progress、issue、spec前後SHA256相同，沒有改派工或checkbox。

## 本次root驗證

Windows Node24.22.1序列執行，全數exit0：

- 一輪 `npm run test:packaging` 真CLI private/public、stale、重新build舊包、VSIX及sidecar tamper、模式錯配與交付SHA256檢查通過。合成產物只留 `.smoke/marketplace-SYNTHETIC-2c5BOB`。
- fresh `npm run packaging:preview`及舊 `npm run package:dev`成功；兩種ZIP均包含最新Bash文件。
- 新preview及舊dev分別以 `scripts/verify-package.mjs [--vsix packages/preview/local-dev-placeholder.sbom-pilot-0.1.0.vsix] --node D:/Project/Git/sbom-pilot/.smoke/handlers/node-v20.20.2-win-x64/node.exe --node C:/nvm4w/nodejs/node.exe`通過各四組dist／VSIX × Node20／24探測，包含SDK真實resource/glob/process、秘密先登錄、manifest、licenses、素材及相對連結。
- 109項交付SHA256逐檔一致；`git diff --check c4212ef..HEAD`通過。tfx僅既有yaml／lock MIME警告。

獨立比較舊清單與新常數，18個來源root及順序完全相同，fixture另加node_modules共19個；src、package-lock、images無diff。原完整116／175／spacing及雙平台矩陣保留既有證據，此輪未重跑。worker本輪Linux fresh preview證據已讀取並保存，沒有重跑下載／還原矩陣。

## 最新本機預覽與雜湊

預覽資料夾：`D:/Project/Git/sbom-pilot/packages/submission/preview/local-dev-placeholder.sbom-pilot-0.1.0-EbqmRP`，仍為 **LOCAL PREVIEW ONLY**。

- preview VSIX：3789348 bytes，SHA256 `8cf9d81634b85c75c936d5d39cbc170552fb90dd00ddb6a4e3fda290371c7af9`。
- 舊dev VSIX SHA256 `cf0125b53ae2cd967752f75a361b021f1d00c9ddeafb548ebef513718eef74e6`。
- runtime SHA256 `c937caf650b101fd888ece192c7391976da4a3fdb401179e668071e4e9a1388f`，仍與工單15相同。
- icon／dist icon SHA256 `b79ab79483f10bb788a89d9138e4101fc946e1201d6e5f59cbb9f6f96060a9df`；hero SHA256 `83e204b28daaa43a885c1f6a194e90de84c003f028f0bb8779377d433f62b58d`，素材未變。
- 本機來源snapshot JSON SHA256 `b6038502675b32a2cf7b900f5090b76dff97afe1361f533b7bcfc611a5e7620d`；交付SHA256SUMS SHA256 `e146a9a7a8015500dfbb39e6adc35dfaf62d732bfd3f502525539e1c6633aa80`。各checkout收據分開保留，不宣稱跨平台ZIP位元組相同。

## 交還

root ignored `.smoke/review-16-final/`保存五組命令／日誌、雜湊總表，及候選summary／Windows完整性／Windows與Linux preview四個一般檔案副本；沒有搬依賴或symlink。`final-summary.json` SHA256 `e3a914f11cac12e2e6e96ddb0521d14e78def9f9f840f092c54b9a01689a032f`。

[Standards複查](16-standards-recheck.md)確認原判斷性possible Duplicated Code解除，無新發現；保留初次報告。此處不宣告Spec已複查，root收尾由parent處理。沒有active sessions，未清理舊受保護殘留、push、PR、publish或share。正式Publisher／公開Repo與live Azure／企業環境／arm64仍未驗收。
