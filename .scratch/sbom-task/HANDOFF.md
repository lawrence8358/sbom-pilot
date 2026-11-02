# SBOM Pilot 續接入口

五小時額度交接保存於 `7ba0797`；使用者其後要求繼續。現在 01–11 均已整合，只處理 12。以最新 Git、implementation-state 與 worker checkpoint 為準。

## 恢復事實

在 `D:/Project/Git/sbom-pilot` 執行 `node scripts/resume.mjs`，再讀 implementation-state、coordinator 與當前 worktree 的 checkpoint。

- 整合分支 `feature/sbom-pilot`；沒有遠端，不 push、不建立 PR。
- 同時最多一個子代理，包含實作、合併、審查。提交、整合並核對驗證後才換階段。
- 使用原需求「.NET Core」；名稱 SBOM Pilot／sbom-pilot，MIT，作者 Lawrence Shen。
- 實作技能 `C:/Users/lawrence/.codex/skills/implement-spec/SKILL.md`；使用者序列執行與不建 PR 的要求優先。

## 已整合證據

最新產品合併 `7f81211b4d73b7f73885c1afb18f57790f2caeec`；產品與已驗證候選 `b5e8ee1` 一致，typecheck／95 項測試通過。

- 四模式、npm/pnpm/Yarn、各 .NET 格式、單次合併掃描、DT 與本機成品流程已有實測。
- 09：Windows 七種／Linux 四種私有 npm 場景，認證隔離、依賴邊、清理、鎖檔不變；詳見 docs/npm-auth.md／checkpoint09。
- 10：Windows 四種 .NET 格式／Linux .NET Core 的真實私有及公開 NuGet 還原、SBOM／Schema／依賴邊／本機成品通過；錯誤及缺認證、分層設定、既有鎖檔、ProjectReference 同名異網址拒絕均通過。Windows/Linux 各 95 項測試；Node20/24 套件秘密遮罩通過。詳見 docs/nuget-auth.md／checkpoint10。
- Docker 已實際用於 Linux Node20/24、SDK10.0.101 還原／合併掃描及兩種私有來源。Linux 冷 SDK 下載仍待 12。
- 本機 artifact adapter、容器、解包啟動不等於真實 Azure 安裝／成品下載；live 驗收保持未驗證。

## 下一步：12

- 工單 12 的實際路徑請由 issues 目錄列出。
- worktree `D:/Project/Git/.sbom-pilot-worktrees/12-final-delivery`，分支 `ticket/12-final-delivery`。
- 先讀該 worktree checkpoint12、Git log/status；若 checkpoint 尚未建立，表示剛派工，不能重置既有變更。
- 最終套件流程回歸、Linux 冷 SDK 取得、完整文件與公開交付準備。評估移除僅用於 Node 快取／解壓的 azure-pipelines-tool-lib，解決其 nodejs-file-downloader4.13.0 缺完整 ISC 告示的公開打包阻擋；保留版本／checksum／跨平台／完成標記驗證，不能捏造告示或關閉 gate。
- 保留 sourceRoot／實體暫存邊界、secret module 首先載入、obj/assets 例外、Framework nupkg 驗證、jsonc-parser ESM alias、DT 失敗仍交付有效成品及 UTF8 串流修正。

## 最終審查與外部邊界

12 完成後另派唯一 merger 整合並驗證，再固定以 `e3a5bf6ed57b74c519d0d64285f2929d0195688b` 執行 Standards／Spec code review，兩軸序列執行。發現問題由單一隔離 implementer 修正、驗證、整合，最後才安全清理已整合 worktrees。

公開交付仍需實際 Publisher ID／公開 Repo URL，目前為 local-dev-placeholder；不得從作者姓名猜測。Services／Server 真實安裝、UI、成品下載缺環境，保持未驗證。固定 cdxgen13.6.0 部分 Yarn workspace 的 dev-only 組件會標為 required，依使用者指定保留上游 required scope 行為，不自行新增篩選。

舊代理 ID 可復用，完成依據是提交及驗證。長命令/session/PID/Docker 資源先核對 checkpoint 與實際程序，避免重跑未受變更影響的檢查。研究筆記位於 `D:/Project/Git/.sbom-pilot-notes`。
