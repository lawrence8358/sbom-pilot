# SBOM Pilot 額度交接

使用者於 2026-11-03 要求：五小時額度將到，先保存並交接。接手後先恢復既有工作，不另外建立重複任務。

## 接手第一步

在 `D:/Project/Git/sbom-pilot` 執行 `node scripts/resume.mjs`，讀取 `implementation-state.json`、本檔與 `checkpoints/coordinator.md`，再進入目標 worktree 讀取該處的 checkpoint。以實際 Git HEAD/status 為準。

- 整合分支：`feature/sbom-pilot`；沒有遠端，不 push、不建立 PR。
- 同時最多一個子代理，包含實作、合併與審查。每張工單提交、整合、核對驗證後才切下一張。
- 用語使用原需求「.NET Core」。不要再加入「現代 .NET」。
- 實作技能：`C:/Users/lawrence/.codex/skills/implement-spec/SKILL.md`；使用者的序列執行與不建 PR 要求優先。

## 已整合及驗證

01–08、11 的產品程式已整合。最新產品合併 `972bb966e023af10d7e7a52e4ee2823100004d82`；整合後 typecheck 與 76/76 測試通過。之後 root 的提交是進度／交接文件。

- 四種模式已具備：Vue、.NET Core、.NET Framework、前後端合併。
- npm/pnpm/Yarn 公開來源、.NET 各格式、DT 上傳與失敗後仍要求發佈成品均有本機驗證。
- Windows/Linux 的獨立 dist／實際解開 VSIX 在 Node20/24 驗證已通過。
- 使用者問 Linux 怎麼測，並明確提供 Docker。已實際使用本機 Docker；[合併驗證](../../docs/combined.md) 保存映像、完整重跑命令與結果。
- Linux Ubuntu24.04 SDK10.0.101 的真實 NuGet restore＋pnpm 合併掃描通過：30 個組件、前後端依賴邊、單次掃描／本機成品、鎖檔不變；獨立 .NET Core 6 個組件。這個映像已預裝 SDK，Linux 首次 SDK 下載路徑仍待補驗。
- 本機成品 adapter／容器啟動不等於真實 Azure 安裝與下載驗收；11 的 live 驗收仍未完成。

## 目前唯一進行中的工作：先續接 09

- 工單：`issues/09-private-npm-feeds.md`。
- 分支：`ticket/09-npm-auth`。
- worktree：`D:/Project/Git/.sbom-pilot-worktrees/09-npm-auth`。
- checkpoint：上述 worktree 內 `.scratch/sbom-task/checkpoints/09.md`，不是 root 內尚未合併的同名檔。
- 已保存初版認證實作 `33c4e58`，最後交接提交為 `d4dc0498269343ee12ff27b45df81a3676804c21`，worktree 乾淨。它是 WIP，尚未整合，不能當作 09 完成。
- 已有 optional `npmCredentials` JSON、secret import 前置遮罩、child-only 暫存 userconfig、pnpm12 auth file、modern Yarn 臨時 plugin／in-memory auth map。首輪 typecheck 與 82 項測試通過；最後新增的 preflight/child HOME 測試只完成 typecheck，尚未重跑測試。真實私有套件還原／掃描、建置及打包尚未驗證。
- 最後新增要求：常見 `${NPM_TOKEN}`／`${NODE_AUTH_TOKEN}` 不能全部當成不支援。加入最小且明確的選填環境變數映射（例如變數名對應 credential 欄位／必要 Basic 編碼），只注入 child env；驗證名稱、別名、衝突與遮罩，保留 Repo 位元組。不要猜來源／秘密值；只有確實無法安全映射的設定才精確報錯。檢查此要求是否已開始實作，接續既有修改。
- 還要完成：真實本機 private registry 的 npm、pnpm10/12、Yarn Classic/PnP/node_modules 成功／錯誤／缺認證、多來源隔離、清理、不洩密、鎖檔不變及有效 SBOM／本機成品；README/UI/建置/VSIX。完成提交後再另派唯一 merger 整合。
- 官方 Yarn4.18.1 來源研究在 `D:/Project/Git/.sbom-pilot-notes/yarn-auth.md`。Plugin 候選已寫入 WIP；需要真實 CLI 驗證，不能把來源推論當作已通過。

## 其後順序

1. 09 完成、整合並驗證。
2. 10 私有 NuGet 認證：尚未開始；沿用已整合的 SDK/MSBuild 還原與 child env seam，另建隔離 worktree。
3. 12 最終整合與公開交付準備：尚未開始。補 Linux 冷 SDK 取得、最終打包流程及各認證模式回歸，更新所有文件與驗收清單。
4. 最後以 `e3a5bf6ed57b74c519d0d64285f2929d0195688b` 為固定基準，依 code-review skill 分開執行 Standards／Spec 審查；因使用者要求，兩者序列執行。修正、驗證後才清理已安全整合的 worktrees。

## 12 必須處理／如實保留的界線

- 公開 Publisher ID 尚未確認，沒有公開 Repo URL；現有 VSIX 明確使用 local-dev-placeholder，不能捏造正式資料。
- nodejs-file-downloader4.13.0 只有 ISC metadata、缺完整 notice，因此 public packaging 有 gate。可評估移除未使用的 azure-pipelines-tool-lib 下載依賴：目前只使用其快取／解壓三類 helper。若替換，保留跨平台工具取得、快取與驗證行為，實測冷啟動；不要捏造 license 或直接關閉 gate。
- 真實 Services/Server 的安裝、Classic/YAML UI、Agent 成品下載與上傳失敗結果仍無環境。詳見 `docs/compatibility.md` 手動驗收；保持未驗證標示。
- 固定 cdxgen13.6.0 在部分 Yarn workspace 會把 dev-only 套件標為 required；已記錄，不新增自製篩選或保證所有非生產依賴皆排除。
- 保留 obj/project.assets.json 排除例外、Framework packages.config/nupkg 完整性檢查、jsonc-parser ESM alias、DT 失敗仍發佈有效成品、secret module 首先載入，以及 UTF-8 分段輸出修正。

## 代理／程序

現有對話 ID 可復用，但不作為完成依據：explore_restore 已保存09並停止，沒有09命令／session／PID／container執行中；explore_compat 的06、implement_01 的11已完成。接手先確認所有代理／程序狀態，再僅續接09。先前 Docker 資源以 checkpoint07、11 的最後紀錄及實際程序為準，避免重跑已完成命令。
