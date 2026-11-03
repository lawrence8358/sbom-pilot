# SBOM Pilot 續接入口

先在 `D:/Project/Git/sbom-pilot` 執行 `node scripts/resume.mjs`，再讀 implementation-state、coordinator 與當前 worktree 的 checkpoint。最新 Git／checkpoint 優先於歷史摘要。

## 現況與固定約束

- 整合分支 `feature/sbom-pilot`；無遠端，不 push、不建立 PR。
- 同時最多一個子代理，包含實作、合併、審查。每張提交、整合、驗證後才換階段。
- 01–13 已整合。最新產品合併 `8b6969ded4884cb0a4d759dc70aabb2e246715dd`，與候選 `4818116` 一致；root npm ci／typecheck／format／167項中文說明／99項測試／build／devVSIX／test:package 通過。
- 原名稱 SBOM Pilot／sbom-pilot，Task 顯示 SBOM Pilot — Generate & Upload SBOM；MIT，Lawrence Shen，正體中文。使用原需求「.NET Core」，避免「現代 .NET」。
- 執行技能 `C:/Users/lawrence/.codex/skills/implement-spec/SKILL.md`；使用者序列與無 PR 要求優先。

## 工單 13 已完成；現在只做最終審查

工單13已整合，以下保留範圍與中途證據供查核。Standards／Spec 初次審查均完成，固定比較 e3a5bf6...8b6969d，報告在 reviews/standards.md、spec.md、coordinator-findings.md。現在只處理工單14：單一 implement_01 在 D:/Project/Git/.sbom-pilot-worktrees/14-review-fixes、ticket/14-review-fixes 集中修正（一項註解、兩項重複政策、並行快取競爭、Windows有界rename重試、正式URL驗證）。先讀該worktree checkpoint14及Git實況；提交、驗證、唯一merger整合後才結案審查及安全清理，不能把初次報告當作已修正。

使用者要求接續未完成工作，同時整理人類易讀的 README／README-Dev，DEV 加 Mermaid 執行流程圖，src TypeScript 加中文函式用途註解、換行排版及複雜度優化。已授權，無需重問。

- 工單 `issues/13-documentation-and-source-readability.md`；規格 Comments 已補追加範圍。
- worktree `D:/Project/Git/.sbom-pilot-worktrees/13-readability`，分支 `ticket/13-readability`。
- 讀該 worktree checkpoint13、Git log/status。若 checkpoint 尚未建立表示剛派工，不能重置既有變更。
- 13 已提交中途版本 `8ee196a`：兩份 README 重整與 Mermaid、38 個 TS 檔格式化、159/159 中文具名說明、主要複雜函式責任拆分；型別／格式／說明檢查及99項測試通過。真正 Windows／Linux 重構後套件與來源流程驗證仍在進行，不能視為工單已完成。較早責任拆分在 `2c8b22a`／`911e2aa`，精確指標與恢復命令見 checkpoint13。
- 具名函式／方法／具名函式常數須有實質中文說明，避免模板註解；短匿名回呼不需逐個重述語法。提供可重跑格式化檢查，拆解複雜邏輯而保持原介面及行為。
- 文件依用途、操作與維護順序整理，保留必要條件／參數／限制，把細節放在適當連結；Mermaid 必須反映四模式、單次掃描、驗證、DT 與有效成品／失敗路徑。

## 不可回歸的產品行為

保留 sourceRoot／實體暫存邊界、secret module 首先載入、安裝／還原限定來源認證、鎖檔、obj/assets 例外、Framework nupkg 完整性、jsonc-parser ESM alias、單次合併掃描、DT 失敗仍交付有效成品、UTF8 串流及安全工具快取。

12 已用真正解包 VSIX 在 Windows／Linux 驗證各管理器、私有 NuGet／npm、合併與 Framework、DT 接受／拒絕、有效成品及本機 adapter 故障；Linux 從無 SDK 的 Node 容器自行取得 Node／官方 SDK10.0.101 後完成私有合併流程。Node20/24 各99項測試與 SDK 動態資源／秘密／告示／文件連結檢查通過。詳見 checkpoint12／docs/compatibility.md。

SDK runtime-only 封裝保留實際資源與25筆真實告示，未使用 downloader/tool-lib 不分發，原 ISC 告示缺件 gate 已解除；不要恢復未使用相依，也不要捏造告示。npm audit 留一項上游 minimatch moderate advisory（兩個受影響條目），未強制 major override。

## 之後與外部邊界

13 完成後由唯一 merger 整合並驗證，再以 `e3a5bf6ed57b74c519d0d64285f2929d0195688b` 為固定基準執行 Standards／Spec code-review，序列執行；問題集中由單一隔離 implementer 修正。最終檢查通過後才安全清理已整合 worktrees。

實際 Publisher ID／公開 Repo URL 尚缺，devVSIX 明確使用 local-dev-placeholder。Services／Server 安裝、Classic／YAML UI 與真實成品下載／非同步失敗傳播仍 UNVERIFIED；本機 adapter／容器不替代 Azure 實測。arm64、企業網路／公司 feed 未提供對應環境。Yarn required scope 保留上游已知行為，不自行新增篩選。

12 的可選診斷暫存清理曾遭自動核准審查拒絕（blocked by policy），該目錄保留；不要混同產品失敗。精確路徑／Docker 資源／命令與 hash 在 checkpoint12。先核對實際程序，避免重跑未受變更影響的檢查。研究筆記在 `D:/Project/Git/.sbom-pilot-notes`。五小時舊交接 `7ba0797` 已由後續進度取代。
