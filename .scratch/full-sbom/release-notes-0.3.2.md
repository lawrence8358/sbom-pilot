# SBOM Pilot v0.3.2

修正 0.3.1 的「OSV 弱點報告」頁籤沒有出現在建置結果頁的問題。

- 頁籤元件類型改為 `ms.vss-build-web.build-results-tab`（0.3.1 誤用通用的 `ms.vss-web.tab`，Azure DevOps 不會將其放入建置結果頁）。
- Task 與 Azure DevOps 擴充套件版本升為 `0.3.2`；Task 行為與 0.3.1 相同，0.3.1 的功能說明見 [release-notes-0.3.1.md](release-notes-0.3.1.md)。
- 權限不變（`vso.build`），已在 0.3.1 授權的組織不需再次同意。
