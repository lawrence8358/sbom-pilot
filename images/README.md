# SBOM Pilot 品牌素材

這兩張 PNG 是 2026-11-04 以內建 image_gen 一次性產生、人工檢查後保存的專案素材。日後的 build／packaging 直接讀取檔案，不會連線生成圖片，也不需要圖片服務 API Key。

| 檔案 | 尺寸 | 用途 |
| --- | --- | --- |
| extension-icon.png | 1254 × 1254 | Marketplace 圖示及 Task 圖示 |
| marketplace-hero.png | 1672 × 941 | Marketplace overview 橫幅 |

羅盤、套件與組件連線代表產品的導覽與軟體清單用途。橫幅是產品插畫，不是 Azure DevOps 實際介面截圖；沒有使用 Microsoft／Azure／CycloneDX 的官方 Logo，也不表示官方認證。

生成模式及最終 prompts（含一次針對性修正）保存在 [generation-prompts.json](generation-prompts.json)。圖片與專案採相同 MIT 授權；詳見 [LICENSE](../LICENSE)。原始生成檔另保留在生成工具輸出位置，專案不依賴該本機路徑。
