# Spec 修正複查

僅審查工單14差異：`8b6969ded4884cb0a4d759dc70aabb2e246715dd...917afff17e06795113fb31d6d05b28167ec1d393`，後者為固定產品 HEAD。初始基準仍為 `e3a5bf6ed57b74c519d0d64285f2929d0195688b`；不取代原始兩軸或協調查核報告。

**原 Spec P2 已修正；本次未發現新增實際缺陷或未結案功能問題。**

- `src/node-cache.ts:106–108` 重讀新格式標記並驗證勝出工具，避免首次讀取競爭誤報損壞；受控交錯回歸涵蓋此路徑。
- `src/node-cache.ts:51–70` 僅 Windows EPERM／EACCES／EBUSY 且目的地不存在時重試，最多5次、總等待750ms。不完整目的地立即保留原錯誤；非暫時或最終失敗不吞掉。完整勝出者仍經 `:120–123` 實際驗證；`:125–126` 只清本次 staging。回歸涵蓋成功、五次失敗及不完整勝出者保留。
- `scripts/release-identity.mjs:7–10` 用 URL parser 驗證 HTTPS，拒絕帳密、query／fragment、佔位與保留測試網域；`:3` 診斷不回顯秘密。`scripts/package.mjs:9–17` 保留 devVSIX 行為；正式語法檢查不代替公開性／Publisher 權限驗收。
- `src/dotnet/assets.ts:10–26` 共用必要物件及專案身分判定。SDK `restore.ts:164–175`、Framework `framework.ts:225–249,319–373` 保留各自診斷、評估路徑、鎖檔／packages.config hash 及 nupkg 檢查；共用競爭鎖檔清單內容亦未改。

本次核對程式、回歸及 `14-integration.md`／checkpoint14；未重跑無疑點矩陣。108項測試、170項註解及 Windows／Linux Node20／24 封裝／真實流程是既有整合證據，非本次新增執行。

**外部仍未驗收：** live Services／Server 安裝、Classic／YAML UI、成品下載／非同步失敗傳播、實際 Publisher／公開 Repo、arm64、公司來源／企業網路。未宣稱 live Azure 通過。
