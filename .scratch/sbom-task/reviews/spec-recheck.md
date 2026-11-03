# Spec 修正複查

範圍：僅工單 14 修正差異 `8b6969ded4884cb0a4d759dc70aabb2e246715dd...917afff17e06795113fb31d6d05b28167ec1d393`。固定產品 HEAD 為後者；初始審查基準仍為 `e3a5bf6ed57b74c519d0d64285f2929d0195688b`。本報告不取代原始 Spec／Standards 或協調查核紀錄。

**結論：原 Spec P2 已修正；本次未發現新增實際缺陷或尚未結案的功能問題。**

- **快取競爭：** `src/node-cache.ts:106–108` 在 legacy 檢查失敗後重驗新格式完整標記，呼叫 `verify(root)` 才接受勝出者，符合原 P2 要求。受控交錯回歸覆蓋首次讀取與原子發佈之間的競爭。
- **Windows 重試與保護：** `src/node-cache.ts:51–70` 僅對 Windows EPERM／EACCES／EBUSY、且目的地不存在時重試，最多 5 次，等待合計 750ms。已存在但不完整的目的地立即保留原錯誤；未刪除或覆寫目的地的清理路徑。完整勝出者仍經 `:120–123` 檢查及實際版本驗證；`:125–126` 僅清理本次 staging。永久／非暫時錯誤不被轉成成功。回歸涵蓋成功重試、五次失敗及不完整勝出者保留。
- **正式 metadata：** `scripts/release-identity.mjs:7–10` 使用 URL parser 驗證 HTTPS，拒絕內嵌帳密、query／fragment、文件佔位與保留測試網域；`:3` 使用固定診斷，不回顯秘密。`scripts/package.mjs:9–17` 僅正式封裝驗證並使用正規化 URL，devVSIX 分支未改。語法檢查不代表公開性或 Publisher 權限已驗收。
- **還原完整性：** `src/dotnet/assets.ts:10–26` 共用必要物件及專案身分判定；SDK `restore.ts:164–175` 與 Framework `framework.ts:225–249,319–373` 保留各自診斷、評估後路徑、既有鎖檔／packages.config hash 與 nupkg 檢查。共用鎖檔候選清單的內容與衝突行為亦未改變。

本次讀取實作、修正回歸及 `14-integration.md`／checkpoint14 的既有證據，未重跑無疑點的完整測試或下載矩陣。整合紀錄的 108 項測試、170 項註解與 Node20／24 封裝／跨平台真實流程屬已記錄驗證，並非本次重新執行。

**外部驗收仍未完成：** 真實 Services／Server 安裝、Classic／YAML UI、成品下載／非同步失敗傳播、實際 Publisher／公開 Repo、arm64、公司來源／企業網路。未宣稱 live Azure 通過。
