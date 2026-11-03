# 最終本機交付檢查點

## 已完成

- 整合分支 `feature/sbom-pilot`，01–14皆已提交與整合，沒有未完成程式工單、活動worker或活動測試session。
- 使用者追加的README導讀、README-Dev Mermaid、全體src TypeScript中文用途說明／排版／複雜度拆分已完成；工單13/14核銷。[審查總表](../reviews/report.md)保留初次兩軸與獨立複查，沒有未結案程式缺陷。
- 候選14 `30a2caec244daa800b3a9c61479332253d71138c`；合併 `c8310016f4b975a84cd7cfa83a1701db813d5f5b`；root產品與候選一致，最後驗證提交 `917afff17e06795113fb31d6d05b28167ec1d393`。後續修改僅審查／續接文件。
- Windows/Linux Node20/24各108項測試，170中文具名說明、型別、格式、build及真實dist/VSIX入口檢查通過；受影響冷Node與私有NuGet／Framework真實流程通過。精確命令、失敗與修正、SBOM hash見checkpoint14；root命令及保留證據見reviews/14-integration.md。
- 最終開發VSIX：`packages/local-dev-placeholder.sbom-pilot-0.1.0.vsix`，443939bytes，SHA-256 `110e443bcc9cfb8e3fa0f974d05939b18db3fc736033f9660df1cbb88eb91e26`。

## 清理接續

清理前核對14個worktree皆位於已明確命名的 `D:/Project/Git/.sbom-pilot-worktrees`（非連結目錄），沒有未提交變更、HEAD都是整合分支祖先。原生git worktree remove未使用force、不刪branch、不reset/clean。14個註冊均已解除，只有root仍註冊；9個目錄完整移除，03／05／07／09／13有刪檔失敗殘留，直接刪除03遭自動審查拒絕後保留所有同類殘留。詳見 [清理結果](../reviews/worktree-cleanup.md)，不再重試替代刪除。必要證據已複製root `.smoke/review-14/`，清理前後記錄在root忽略目錄 `.smoke/worktree-cleanup/`；不得單靠舊worker路徑判斷工作未完成。

保留本機Docker測試證據：14共用volume `sbom-pilot-14-work`，容器 `sbom-pilot-14-linux`／`sbom-pilot-14-linux-recheck`／`sbom-pilot-14-node20` 都已退出。最終實況查核：原缺file容器目前ExitCode255（原host session報1），接續封裝容器0、Node20容器0；不從後來的狀態改寫原測試失敗原因。未清理無關容器或volume。

## 外部邊界

實際Publisher／公開Repo未提供；live Services／Server安裝、Classic／YAML UI、原生成品下載及Agent非同步失敗傳播、arm64與公司feed／企業Proxy/CA/client certificate組合仍未驗收。沒有remote、push、PR或Marketplace上傳。devVSIX不是正式公開發佈。

舊診斷暫存 `C:/Users/lawrence/AppData/Local/Temp/sbom-final-GP4o3T` 的可選刪除曾遭自動審查拒絕，理由僅「blocked by policy」；保留且不再嘗試。此項不影響產品測試或套件。

如再次續接，先跑 `node scripts/resume.mjs`，核對Git/status與此文件。本機程式與審查已完成，沒有待派工工作；檔案殘留保留原因如上，外部驗收只在有對應環境後進行。所有原始工單與checkpoint已保留Git提交，不依賴代理記憶。

清理中途：01/02原生git移除成功；03 git已解除註冊但刪除回報Directory not empty。核對明確範圍與原clean/merged證據後，PowerShell刪除殘留操作被自動核准審查拒絕，理由僅blocked by policy；03保留，不再嘗試替代刪除。繼續其他已驗證工作區的原生git移除，必要時保留殘留。
