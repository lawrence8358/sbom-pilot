# SBOM Pilot 圖片素材

這兩張 PNG 是 2026-11-04 以內建 image_gen 一次性產生、人工檢查後保存的專案素材。日後的 build／packaging 直接讀取檔案，不會連線生成圖片，也不需要圖片服務 API Key。

2026-11-06 經維護者同意，以本機工具將原圖示等比例縮至 256×256；保留原有設計，檔案為 60,594 bytes（約 59.2 KB），低於市集的 1024 KB 上限。橫幅未變更。

| 檔案 | 尺寸 | 用途 |
| --- | --- | --- |
| extension-icon.png | 256 × 256 | Marketplace 圖示及 Task 圖示 |
| marketplace-hero.png | 1672 × 941 | Marketplace overview 橫幅 |

羅盤、套件與組件連線代表產品的導覽與軟體清單用途。橫幅是產品插畫，不是 Azure DevOps 實際介面截圖；沒有使用 Microsoft／Azure／CycloneDX 的官方 Logo，也不表示官方認證。

生成模式及最終 prompts（含一次針對性修正）保存在 [generation-prompts.json](generation-prompts.json)。圖片與專案採相同 MIT 授權；詳見 [LICENSE](../LICENSE)。原始生成檔另保留在生成工具輸出位置，專案不依賴該本機路徑。

## README 截圖

`screenshots/` 是維護者於 2026-11-12 在 Azure DevOps Services 實際操作時擷取的畫面，供 README 說明使用。組織與專案名稱、管線與建置標題、使用者頭像與名稱、專案路徑，以及實際弱點的套件、版本與編號已打馬賽克。

| 檔案 | 用途 |
| --- | --- |
| screenshots/permission-authorize-dialog.png | 更新擴充套件時，組織管理員同意 Build (read) 權限的對話框 |
| screenshots/permission-build-read.png | 組織設定的擴充套件詳細資料中顯示的 Build (read) 權限 |
| screenshots/classic-task-settings.png | Classic Build 中 SBOM Pilot Task 的設定畫面 |
| screenshots/osv-report-tab.png | 建置結果頁「OSV 弱點報告」頁籤的實際畫面 |
