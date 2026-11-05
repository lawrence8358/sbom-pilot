# 工單15／16本輪工作區清理

本機實作、獨立整合與兩軸審查皆結案後才清理。分別核對下列實體絕對路徑（不是連結）、git status乾淨、HEAD為整合分支祖先；根目錄預覽及精簡證據已保存。未刪branch或提交，不用reset／clean／force。

| 工作區 | 最後提交 | 結果 |
| --- | --- | --- |
| D:/Project/Git/.sbom-pilot-worktrees/15-frontend-command-logging | 87597bf | 原生git worktree remove完成 |
| D:/Project/Git/.sbom-pilot-worktrees/15-command-log-safety | 8993b98 | 原生git worktree remove完成 |
| D:/Project/Git/.sbom-pilot-worktrees/16-marketplace-packaging | b231a69 | Git移除註冊後因Filename too long留下目錄；核對為同一個已合併實體目錄、.git不存在，再以Node fs.rm處理長路徑，完成刪除 |

以上三個工作區與目錄均已移除，只保留root註冊；分支及其歷史仍在。原生Git結果保存在root忽略目錄 .smoke/worktree-cleanup-15-16/results.json，16的exit255保留原始事實，不改寫為原生Git成功；後續長路徑清理另行完成驗證。

root保留 .smoke/review-15、review-15-safety、review-16、review-16-final與最新packages/submission/preview資料，15原始紅測試日誌也另存root。未動Docker容器／volume。

舊03／05／07／09／13未註冊殘留及先前被拒的temp沒有觸碰，也未改用其他方式重試。其政策與歷史結果仍依 [舊清理報告](worktree-cleanup.md)；本輪長路徑清理僅限不同的16明確目標，沒有自動核准拒絕事件。
