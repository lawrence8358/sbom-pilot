# 16: Marketplace 打包指令、上架文件與一次性圖片

Status: ready-for-agent
Blocked by: 15

## What to build

參考本機 AI-PR-AutoReview 的 `packaging:install-tool`／`packaging:package`，提供可重跑的 Azure DevOps Marketplace 準備流程；產出 VSIX、可交付的上架資料與圖片。只準備本機產物，不自動上傳或建立遠端。

## Acceptance criteria

- [x] 提供 `packaging:install-tool`、`packaging:check`、`packaging:package`、`packaging:preview`、`packaging:submission`；沿用鎖定的本機 tfx，不要求全域浮動版本。保留舊 package:dev/release 相容。
- [x] 一次性產生的 icon／hero 存入 images，記錄生成模式／prompts，打包不呼叫 AI。manifest 使用 icon 及專用 Marketplace overview；hero 為產品插畫，不偽造實際 UI screenshot。VSIX 內所有相對文件／圖片連結可用，Task 有圖示。
- [x] `packaging:preview` 無帳號資訊也可產生明確標示預覽的私有 VSIX 與獨立上架資料夾；正式 package/submission 必須使用實際 Publisher 與公開 HTTPS Repo，保留現有 release identity/runtime notices gate，不能自動套用參考專案帳號或猜 Repo URL。
- [x] 正式 package 可一個指令完成檢查、建置、VSIX 與 submission directory：包含該次 VSIX、listing／overview、圖片、manifest、上架說明與 SHA256 清單；拒絕拿舊或不符目前來源的 VSIX 當正式產物。分開的 submission 命令只整理已完成且匹配的正式包。
- [x] README-Dev 與獨立上架說明以正體中文帶讀者從工具準備、設定、預覽／正式打包、portal 上傳、測試組織、公開與改版走完，附官方來源；保留真實 Services/Server 驗收未完成的限制，不宣稱已上架。
- [x] 型別／格式／中文用途／間距／既有完整測試（工單15安全修正後116項）與新的包裝驗證通過，VSIX icon/hero/overview/links/identity/hashes 實際核對；Windows/Linux 的受影響打包流程都測試。不重跑不相關依賴下載矩陣。獨立整合與增量兩軸審查後結案。

## Comments

- 2026-11-04 使用者指定參考 `D:/Project/Git/AI-PR-AutoReview` 的打包指令，並要求一次性生成形象圖片及完整上架說明，目標 Azure DevOps Marketplace。
- 參考專案 publisher 是 LawrenceShen；已詢問是否沿用及實際 SBOM Pilot 公開 Repo URL，尚未收到具體答覆。不把「請繼續」當作提供 URL 或公開發佈授權；可先完成預覽和所有準備。
- 官方依據：https://learn.microsoft.com/en-us/azure/devops/extend/publish/overview?view=azure-devops 及 https://learn.microsoft.com/en-us/azure/devops/extend/develop/manifest?view=azure-devops 。icon 至少128平方，hero 可直接嵌 overview，不設為虛構 screenshot。

## Implementation

本機實作／獨立整合／兩軸複查完成。最終候選b231a69，merge f70fe2b；Standards判斷性1項已解決，Spec0，詳reviews/16-report.md及16-final-integration.md。僅本機準備，實際Publisher／公開Repo與live Azure驗收仍未提供，不宣稱已上架。
