# SBOM Pilot v0.3.3

修正 0.3.2「OSV 弱點報告」頁籤顯示「無法取得目前建置資訊，請重新開啟建置結果頁。」的問題。

- 建置結果頁籤（build-results-tab）的主機不提供建置頁資料服務的建置資料，而是透過頁籤設定的 `onBuildChanged` 回呼傳入目前建置。頁籤改為優先從 `onBuildChanged` 取得建置與專案，舊主機仍以建置頁資料服務與專案頁服務備援。
- Task 與 Azure DevOps 擴充套件版本升為 `0.3.3`；Task 行為與 0.3.1 相同，功能說明見 [release-notes-0.3.1.md](release-notes-0.3.1.md)。
- 權限不變（`vso.build`），已授權的組織不需再次同意。
