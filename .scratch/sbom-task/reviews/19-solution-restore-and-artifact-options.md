# 0.1.2 方案還原與成品設定驗證

## 修正與參數核對

0.1.1 將 .sln 轉為目錄後逐專案還原，會重複 SDK 準備與 restore，也把方案外專案帶入遞迴掃描。0.1.2 保留選取的方案／專案為目標，評估一次 NuGet restore graph、執行一次 dotnet restore，再以該圖內專案與 project.assets.json 限制 cdxgen 掃描；使用者排除規則繼續套用。目錄模式維持既有逐專案 SDK 策略。

依需求.md 及既有規格，純 .NET Core 使用 -r -t dotnet --required-only --spec-version 1.6 --install-deps false。Task 已先執行 restore，所以 scanner 不再次安裝相依；FETCH_LICENSE 與 CDXGEN_NO_CACHE 透過環境提供。原日誌的 *** 是遮罩值，真實 smoke 確認 install-deps=false；原需求範例的 -p true 為列印表格選項，非產生 SBOM 的必要條件。合併模式的 dotnet/js 與純 .NET Core 的 dotnet 分開處理。

核對固定 cdxgen13.6.0 的 managedBom.js、core/fs.js 及 bin/cdxgen.js：遞迴 discovery 會讀取旁邊的舊 assets，因此除了單次 restore，還需要 include-regex 的 glob 白名單。真實測試涵蓋特殊字元路徑、方案外 stale assets、傳遞相依與既有鎖檔。

新增 artifactName／sbomFileName，預設 SBOM／bom.json，支援 CycloneSBOM／PrimeX.cdx.json；拒絕路徑、控制字元、保留名稱及非 JSON 檔名。掃描前輸出 section 與安全設定摘要。Spec Version help 改成明確純文字。

## 本機證據

- 修正前新增回歸案例證實多次 restore；修正後 npm test 122/122、Node20 聚焦測試6/6。
- 真 packaging CLI 1/1；dist／VSIX × Node20／24 共4個啟動探針通過；格式、註解179/179、間距0、diff whitespace 通過。
- 出貨 handler 真實 SDK／restore／cdxgen／Schema：特殊路徑方案1次 restore、7組件；鎖檔不變，Logging 傳遞相依保留，方案外 Newtonsoft 舊 assets 未納入。
- PortalBackend 真實 .sln 閉包17專案：1次 restore、220組件，CycloneSBOM/PrimeX.cdx.json 與 CycloneDX1.6 Schema 成功。使用者原有6項來源 WIP 未修改。
- 證據 .smoke/19/real-evidence.json 與 .scratch/sbom-task/19-*.log；完整日誌、大型 BOM 不提交。
- 自行檢查此次差異的既有風格及需求符合性，未發現未解決項；沒有使用其他代理。超出掃描根目錄的參照／自訂 assets 路徑會明確拒絕，須使用共同根目錄模式。

## 正式包

- packages/public/LawrenceShen.sbom-pilot-0.1.2.vsix
- SHA256 06b0cda09bb1c23bc08af7f58408e0297b30450e9aafbd9abd1990f40b412475
- submission public/LawrenceShen.sbom-pilot-0.1.2-53kFmS；109項雜湊符合；index.js 與真實測試 vfXxkr 完全一致。

## 雲端驗收進度

使用者手動切到 Chrome 後可繼續操作。相同正式包已上傳 Marketplace LawrenceShen/sbom-pilot；經過 Verifying 後顯示正式 Public 0.1.2。兩次真實 Azure Services Classic 執行使用 definition85、master78ef08f4、Azure Pipelines ubuntu-24.04、.NET Core、Node24.x、PrimeEagleX.Backend.sln、原排除規則與 DT 關閉。

| 驗證 | 預設 | 自訂 |
| --- | --- | --- |
| Run | [2734](https://primeeagle.visualstudio.com/PrimeEagleX/_build/results?buildId=2734) | [2735](https://primeeagle.visualstudio.com/PrimeEagleX/_build/results?buildId=2735) |
| Task 實際版本／狀態 | 0.1.2／Success | 0.1.2／Success |
| Task 時間 | 1m5s | 1m2s |
| restore | 1次方案 restore，17個還原圖專案 | 1次方案 restore，17個還原圖專案 |
| Artifact | 2171，SBOM/bom.json | 2172，CycloneSBOM/PrimeX.cdx.json |
| 實際下載 | 534,763 bytes，223組件，167筆含邊相依記錄 | 534,763 bytes，223組件，167筆含邊相依記錄 |
| 再驗證 | CycloneDX1.6 Schema通過 | CycloneDX1.6 Schema通過 |
| SHA256 | c741db0fe6fe9a0cc8b277f61617ea71fba2e569e6d09c12dc13991fd2e67216 | 40ce4ad910a6c889d6b81ffbef5ca0fdf8b624c7d290b891096a28979e3781b5 |

兩次完整 raw log 各僅1筆 argv=[restore,...PrimeEagleX.Backend.sln]，有掃描前 section、設定摘要、File upload succeed.、Associated artifact 與正確build關聯，沒有 error marker。成品頁各1 published，均透過 Chrome 實際下載並以專案正式 validator 再驗證。機器可讀證據 .smoke/19/azure-2734-evidence.json、azure-2735-evidence.json；原始日誌與BOM留在.smoke而不提交。

Classic UI 已出現成品名稱與SBOM檔名。點選 Spec Version info 能讀到完整純文字：「產生的 SBOM 所採用的 CycloneDX JSON 規格版本。本版支援並驗證 1.6；無論是否推送 DT 都會套用此設定。」Azure 資訊框仍自帶 Link 操作按鈕，已不再只有空白說明與 Link。畫面證據 .smoke/19/azure-spec-help.png。

自訂測試完成後，只將成品名稱／檔名恢復成 SBOM／bom.json，Save 後重新整理並回讀已持久化；其他欄位與歷史 disabled 步驟保留。證據 .smoke/19/azure-definition85-restored-view.txt。使用者可自行改成上述自訂值。

Azure223組件與本機220組件分開記錄，平台與還原條件不同，不要求數量相等。相對前版 Azure229組件，這次少6個 NuGet 版本記錄，符合掃描限方案還原圖的範圍變更；沒有宣稱自動排除方案內 UnitTest。Server／YAML UI、arm64與企業feed等既有外部驗收不在這次 Services Classic 結果中推定通過。
