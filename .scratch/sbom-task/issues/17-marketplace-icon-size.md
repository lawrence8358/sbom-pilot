# 17: Marketplace 圖示檔案大小

Type: task
Status: claimed
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
