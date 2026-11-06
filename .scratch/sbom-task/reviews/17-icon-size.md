# 17 圖示大小修正與正式封裝驗證

2026-11-06，延續58e4105的正式Publisher包；先前7a6db61保留攔截與待辦。使用者明確同意後，以本機System.Drawing將原圖等比例縮至256×256。未替換設計、未動hero、未改runtime。

## 由紅轉綠

舊正式包的實際圖示1,230,605 bytes，大於1024×1024；archive assertion失敗。新增preflight後舊原圖在build前拒絕，CLI回歸測試亦對超標專案圖示失敗。縮圖後：

- images/extension-icon.png：256×256、60,594 bytes，SHA256 f2b92431ca87e4f39da3fdfe0bf1c59919878eb33a6d36fb01cc84b8a8317bae。已檢視縮圖清晰度。
- `npm run packaging:check -- --preview`、設定實際身分後的`npm run packaging:check`：通過。
- `npm run test:packaging`：1個真CLI整合測試通過，含private/public封裝、來源過期與archive竄改攔截。新增邊界案例：1,048,576 bytes接受，1,048,577 bytes在build前拒絕並顯示圖示檔名及實際bytes；finally恢復隔離fixture的原圖。
- `node --check`三個變更mjs、`git diff --check`通過。

## 本次可交付產物

命令：環境變數SBOM_PILOT_PUBLISHER=LawrenceShen，SBOM_PILOT_REPOSITORY_URL=https://github.com/lawrence8358/sbom-pilot，執行`npm run packaging:package`。

- VSIX：packages/public/LawrenceShen.sbom-pilot-0.1.0.vsix，1,869,147 bytes。
- VSIX SHA256：35f995b420ec1523056aeee4037fac8dec87356220bf0d2b3abe47b46d86a039。
- 交付資料：packages/submission/public/LawrenceShen.sbom-pilot-0.1.0-0wMWgX；109項SHA256SUMS逐檔全過。
- 讀取真正extension.vsixmanifest的Microsoft.VisualStudio.Services.Icons.Default，確認指向images/extension-icon.png；從ZIP取出的圖示60,594 bytes、256×256，與來源及dist/icon.png完全相同。
- 真正XML Publisher=LawrenceShen、GalleryFlags含Public；有效manifest public=true；generated VSO repository為使用者指定網址。
- runtime SHA256 c937caf650b101fd888ece192c7391976da4a3fdb401179e668071e4e9a1388f，與原已審查Task程式相同。
- `node scripts/verify-package.mjs --vsix packages/public/LawrenceShen.sbom-pilot-0.1.0.vsix --node D:/Project/Git/sbom-pilot/.smoke/handlers/node-v20.20.2-win-x64/node.exe --node C:/nvm4w/nodejs/node.exe`：Node20.20.2／24.22.1共四組dist/VSIX啟動、SDK資源／子程序、秘密遮罩、manifest、授權與相對文件／圖片連結通過。
- 精簡證據：忽略目錄.smoke/icon-release/summary.json；重驗腳本.smoke/verify-icon-release.mjs。無執行中程序。

## 自查與邊界

Standards：此次只新增圖示大小參數、呼叫端指定限制、CLI精確邊界測試與archive位元組檢查；中文用途及區塊空白保留，沒有引入外部服務或建置時圖片生成。自查未見問題。

Spec：符合17工單的縮原圖、1024 KB上限、hero不套用圖示上限、實際Publisher公開包與ZIP／Node驗證。自查未見缺漏。本次為協作者自查，沒有新增獨立代理審查；01–16既有獨立審查紀錄保留。

尚未代為上傳、公開、推送Git或驗收真實Azure安裝。Microsoft是否接受新包仍須實際上傳確認；不將本機成功記成市集審核通過。版本維持0.1.0，先前上傳均回報拒絕。
