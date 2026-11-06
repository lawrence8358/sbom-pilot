# LawrenceShen 正式身分打包（2026-11-06）

使用者回報市集Publisher mismatch：測試包內local-dev-placeholder與上傳帳號LawrenceShen不同。直接讀取preview及舊dev ZIP的extension.vsixmanifest，兩者皆重現相同不符。使用者已明確提供實際Repo https://github.com/lawrence8358/sbom-pilot；匿名讀取顯示空Repo，可存取，不代為推送。

來源提交dcd2866把Publisher／Repo寫入vss-extension.json，README／Dev／overview／上架與相容性文件同步使用實際身分；移除「尚未提供」，更正Live測試指南要產生實際Publisher私有包而非上傳placeholder。沒有修改Task程式、依賴或版本。

執行（僅本機，不上傳）：

```powershell
$env:SBOM_PILOT_PUBLISHER = 'LawrenceShen'
$env:SBOM_PILOT_REPOSITORY_URL = 'https://github.com/lawrence8358/sbom-pilot'
npm run packaging:check
npm run packaging:package
```

結果：版本0.1.0、Publisher LawrenceShen、public:true、name SBOM Pilot；repository與使用者提供網址完全一致。上架檔案 packages/public/LawrenceShen.sbom-pilot-0.1.0.vsix；正式交付資料 packages/submission/public/LawrenceShen.sbom-pilot-0.1.0-HUW3Lx。

- VSIX 3789838bytes，SHA256 b9f50a595e168ee7582b9432b4f076e10090821f23a294efc0e435f29df0a4f3。
- 109項SHA256SUMS逐檔核對通過；實際XML Publisher與GalleryFlags、VSO repository、有效manifest、SBOM Pilot顯示名稱核對通過。本機Publisher對照probe在新包為綠，舊placeholder包仍正確地不符，需選新檔上傳。
- runtime SHA256 c937caf650b101fd888ece192c7391976da4a3fdb401179e668071e4e9a1388f，保持原已審查版本。
- `node scripts/verify-package.mjs --vsix packages/public/LawrenceShen.sbom-pilot-0.1.0.vsix --node D:/Project/Git/sbom-pilot/.smoke/handlers/node-v20.20.2-win-x64/node.exe --node C:/nvm4w/nodejs/node.exe`：Node20.20.2／24.22.1各dist與真正VSIX四組入口全過，包含SDK動態資源／子程序、秘密先登錄、manifest、授權與文件／圖片連結。
- 精簡證據root忽略目錄 .smoke/publisher-release/summary.json。未新增debug至產品，未重新生成圖片或重跑無關116／下載矩陣；tfx只有既有yaml／lock MIME警告。

這解決目前包內Publisher不符的問題，尚未代為上傳／公開、推送Git或驗收真實Azure安裝，不保證Microsoft後續審查結果。Repo目前為空，公開程式內容仍待維護者處理。重新打包仍須在當前terminal設定上述兩個環境變數。
