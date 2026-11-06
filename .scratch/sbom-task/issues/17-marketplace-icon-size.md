# 17: Marketplace 圖示檔案大小

Type: task
Status: resolved
Blocked by: 16

## 問題

使用者上傳 LawrenceShen 正式包時，市集拒絕圖示超過 1024 KB。實際 VSIX 中 images/extension-icon.png 為 1,230,605 bytes；先前只檢查尺寸，漏掉大小上限。

## 驗收

- 保留既有圖示設計，縮小檔案至明顯低於 1024 KB；Task 與 extension 圖示相同。
- packaging:check／package 在建置前拒絕超過 1024×1024 bytes 的圖示，顯示檔案與實際大小；hero 不套用圖示上限。
- 測試上限與超出 1 byte 的情況；實際 VSIX 檢查解壓後圖示大小。
- 重建 LawrenceShen／public:true 正式包，驗證實際 archive、交付雜湊及 Node20/24 入口；本機成功不宣稱市集已接受。

## Comments

2026-11-06：已重現舊 VSIX 大小錯誤，新增 preflight 與 archive 檢查。內建圖片工具保留設計的修正圖仍有 1,188,927 bytes；尚未採用。已詢問是否可改用本機工具縮原圖，等待使用者同意，期間繼續檢查與測試準備。未改動原圖或重新打包。

## Answer

使用者已明確同意本機縮圖。以 Windows System.Drawing 高品質雙三次取樣，將既有 1254×1254 原圖縮至 256×256，不採用另外生成的圖。新 PNG 60,594 bytes，約59.2 KB；已目視檢查，原羅盤／套件／組件設計保留。

- `packaging:check -- --preview` 及正式 `packaging:check` 通過。
- `npm run test:packaging` 通過：含1024 KB接受、多1 byte拒絕、建置前攔截、private/public 真CLI及來源／archive完整性測試。
- 正式 `packaging:package` 通過；實際ZIP圖示路徑、尺寸、bytes、Task圖一致、Publisher/public/Repo、109個交付SHA256及Node20/24共四組dist/VSIX檢查均通過。
- 未重跑不受影響的歷史116個Task測試或Linux工具下載矩陣。未上傳市集，尚不能宣稱Microsoft已接受。

最新產物與hash見 [17驗證紀錄](../reviews/17-icon-size.md)。
