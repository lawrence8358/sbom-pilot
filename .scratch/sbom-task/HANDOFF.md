# SBOM Pilot 續接入口

五小時額度交接已保存於7ba0797；使用者其後明確要求繼續。09已完成整合，現在只處理10。最新Git/state/各worktree checkpoint優先於本摘要。

## 先恢復事實

在 D:/Project/Git/sbom-pilot 執行 `node scripts/resume.mjs`，讀 implementation-state.json、checkpoints/coordinator.md，再讀當前工單在自己worktree內的checkpoint。

- 整合分支 feature/sbom-pilot；無遠端，不push、不建立PR。
- 同時最多一個子代理，包含實作、合併、審查。提交、整合並核對驗證後才換工單。
- 使用原需求「.NET Core」。公開名稱SBOM Pilot／sbom-pilot，MIT，作者Lawrence Shen。
- 實作技能 C:/Users/lawrence/.codex/skills/implement-spec/SKILL.md；使用者序列執行與不建PR的要求優先。

## 已完成產品程式

01–09、11已整合；最新產品合併b79f7cabac753fede56db65574d86ea6d3070453，typecheck／91項測試通過。後續文件提交不改變已驗證產品內容。

- 四種模式、npm/pnpm/Yarn、各.NET格式、單次合併掃描、DT與成品流程已有本機實測。
- 09 Token／Basic／明確變數映射通過Windows7／Linux4真實私有來源案例，含成功、錯誤／缺認證、公開隔離、依賴邊、清理與鎖檔不變；build/devVSIX/套件遮罩檢查通過。詳見docs/npm-auth.md／checkpoint09。
- Docker已實際用於Linux Node20/24、SDK10.0.101還原／合併掃描及私有npm認證。重跑命令、映像與結果在docs/combined.md、docs/npm-auth.md、docs/compatibility.md。Linux冷SDK下載尚待12驗證。
- 本機artifact adapter、容器、解包啟動不等於真實Azure安裝／成品下載；11 live驗收仍未完成。

## 下一步：只做10

- 工單issues/10-private-nuget-feeds.md；分支ticket/10-nuget-auth。
- worktree D:/Project/Git/.sbom-pilot-worktrees/10-nuget-auth。
- 先讀該worktree內.scratch/sbom-task/checkpoints/10.md與Git log/status。若checkpoint尚未建立，表示剛派工，不能重置既有變更。
- 私有NuGet認證須沿用既有SDK/MSBuild還原及有效分層來源設定。需要.NET Core、非SDK PackageReference、packages.config真實成功／錯誤／缺認證、多來源隔離、有效SBOM與本機成品證據，並加入代表性Linux .NET Core Docker驗證。
- 保留InstallOptions.sourceRoot、outside-Git/實體路徑邊界、secret module首先載入、obj/assets例外、Framework nupkg完整性、jsonc-parser ESM alias、DT失敗仍發佈有效成品與UTF8串流修正。

## 其後12與最終審查

1. 10完成、提交，另派唯一merger整合並核對驗證。
2. 12最終產品與文件驗收：Linux冷SDK取得、最終VSIX回歸、公開交付準備。
3. 固定以e3a5bf6ed57b74c519d0d64285f2929d0195688b執行Standards／Spec兩軸code review，依使用者要求序列執行。修正、驗證後才安全清理已整合worktrees。

公開交付尚需真實Publisher ID／公開Repo URL；目前明確使用local-dev-placeholder。nodejs-file-downloader4.13.0缺完整ISC告示，public packaging有gate。12可評估移除僅用於快取／解壓的azure-pipelines-tool-lib依賴，保留跨平台工具取得／快取驗證，不能捏造告示或直接關閉gate。Services/Server真實安裝、UI、成品下載缺環境，保持未驗證標示。

固定cdxgen13.6.0部分Yarn workspace會將dev-only組件標為required，已如實記錄；不新增自製篩選。研究筆記在D:/Project/Git/.sbom-pilot-notes，必要結論應保存在程式碼／checkpoint。

舊代理ID可復用但不作完成依據。長命令/session/PID/Docker資源先核對checkpoint與實際程序，避免重跑已通過且未受變更影響的檢查。
