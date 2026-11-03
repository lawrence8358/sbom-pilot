# 14: 最終審查修正與交付驗證

Status: ready-for-agent
Blocked by: 13

**What to build:** 依兩軸最終審查與已重現查核結果，在單一隔離 worktree 集中修正，保留13的文件與可讀性成果。

## Acceptance criteria

- [x] 修正 validateCdxgenPackage 用途註解，準確描述現有版本與 engines 驗證，不假稱已驗證名稱。
- [x] 專案與 combined 探索共用同一競爭鎖檔候選清單，保留各自探索／衝突語意。
- [x] 共用 .NET assets 結構及專案路徑完整性判定，保留各還原路徑診斷、鎖檔及 Framework nupkg 驗證。
- [x] 修復 Node 快取初次檢查到 legacy 檢查之間的原子發佈競爭，驗證並使用新格式勝出快取，不把完整快取要求清理；補可重現交錯測試。
- [x] 針對已觀察的 Windows rename EPERM 提供有界暫時錯誤重試，測試成功重試與永久失敗界限，保留競爭／不完整快取保護，不刪除其他工作目的地。
- [x] 正式打包拒絕不完整／佔位／含帳密的 repository URL；保留實際 Publisher／Repo 身分仍待提供的狀態，devVSIX 行為不變。
- [ ] 型別、格式、中文說明、完整測試、封裝及受影響實際 Windows／Linux 流程通過；記錄證據並由 merger 整合後核對審查結案。

## Comments

- 2026-11-03：原 implement-spec 已授權最終審查及集中修正；本工單收錄 reviews/standards.md、reviews/spec.md、reviews/coordinator-findings.md。保持一次一位子代理、先提交與驗證再整合，不建立 PR／push。

- 本機修正與受影響驗證已完成：Windows/Linux Node20/24各108項測試、型別／格式／170中文說明、build/devVSIX/隔離套件與實際冷Node及NuGet/Framework流程通過。最後一項保留未勾，等待另一merger整合後核對審查結案；外部Publisher／Repo／liveAzure驗收未冒充完成。證據與資源見checkpoint14。
