# 工單16增量審查條件

- 固定產品基準39584bc（工單15結案）；新工單準備a92e6f1已含16的images，故不能只審a92e6f1以後而漏掉素材與metadata。以 `git diff 39584bc...HEAD` 看完整16增量，原全規格基準e3a5bf6不變。
- 最新規格見issue16-marketplace-packaging-assets.md及spec Comments；依使用者授權產出Azure DevOps Marketplace本機準備，不是網頁建置、不自動發佈。
- Standards：AGENTS／READMEDev與Fowler判斷性smells；腳本保持人類可讀、責任分段與中文用途。新腳本應呼叫現有本機鎖定工具，避免引入浮動全域tfx、不必要runtime依賴或Task邏輯更動。
- Spec：使用者點名的packaging:install-tool/package、完整preview/formal/submission資料、一次性圖片與上架導讀；正式Publisher/Repo gate、private/public狀態和舊包完整性檢查不能放寬；提交資料不得含秘密/假的帳號、合成測試包不可當正式交付。
- 圖片1254平方icon、1672×941hero，已人工檢查且prompts保存；hero是產品插畫，不能標示為實際Azure UI screenshot。文件內連結與VSIX中資源皆需實測。
- 後續marker/hash/證據/候選SHA由實作者與merger補；只一位子代理序列工作，保留WIP，不重跑不相關下載矩陣，不碰舊被拒的清理目錄。

## 協調者實作中查核

- 初版runbook誤稱 `npm run package:release -- --private` 不會轉入內層；以root ignored雙script fixture實測，npm11確實把參數附到整條script末尾（第一支無參數、第二支收到--private）。worker已刪除該錯誤敘述；不是runtime命令更動。公開段沒有新增核准流程，安裝工具可能下載亦已明示。
- 候選c4212ef8ec0bdebbba3a119e8d85213c5a453d61，實作者保存雙平台full116／175中文／spacing0、preview、三mode與stale/tamper完整性、雙Nodeprobes；runtime保持c937...。待獨立整合與兩軸審查。
- 初次Standards已先回報一項判斷性possible Duplicated Code：sourceSnapshot與fixture複製根清單重複。協調者接受共用小型常數的改善，等Spec完成後交原單一implementer集中修正，merger不直接改產品。
