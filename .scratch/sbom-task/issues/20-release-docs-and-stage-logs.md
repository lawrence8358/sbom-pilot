# 20: 統一階段日誌、參數規劃與公開文件

Type: task
Status: resolved
Blocked by: 19

## 驗收

- Node.js、cdxgen、依賴準備、掃描、驗證、DT 與成品發佈各有 Azure 綠色 section 標題；保留 DT 失敗仍發佈有效成品的行為。
- 檢查需求.md，記錄跨模式共用參數與必要差異，不破壞既有 YAML／Classic 輸入。
- README 面向使用者，完整說明參數與使用範例；作為唯一市集介紹，外部圖片與文件使用 GitHub 絕對網址。
- VSIX 只保留執行內容、README、圖示及必要授權；移除重複 overview、CHANGELOG 與過時發布敘述，保留必要第三方告示。
- 發布 0.1.3、測試與封裝驗證、上傳 Marketplace、Azure Pipeline 驗證；將確認後的來源推至使用者指定 GitHub main。

## 授權

使用者已明確授權上傳新版與 push main，覆蓋早期「沒有遠端，不 push」的歷史邊界。

## Answer

0.1.3 實作 b790c5d，序列獨立 Standards／Spec 審查均0發現。122測試、真實封裝、雙Node四入口與四個解包真實案例通過。README唯一市集介紹、全20項參數、GitHub絕對圖片／文件連結、參數規劃與VSIX精簡完成；CHANGELOG與重複overview刪除，必要第三方授權保留。

Marketplace Public0.1.3已上傳驗證完成，公開Details取回新版README。GitHub main已推送並核對公開圖片／文件。Azure85 run2738成功：Task0.1.3、七個已執行階段綠色標題、一次方案restore、223組件；成品2175實際下載534763bytes並再次通過Schema1.6。DT關閉；DT成功／403與成品故障由本機正式包測試驗證，不推定企業DT通過。詳見 reviews/20-release-docs-and-stage-logs.md。
