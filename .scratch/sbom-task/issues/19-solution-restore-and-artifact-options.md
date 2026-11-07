# 19: Solution 單次還原、掃描範圍與成品設定

Type: task
Status: claimed
Blocked by: 18

## 使用者要求

- 依需求.md核對.NET Core cdxgen參數；保留Solution輸入並一次restore，不逐csproj重複還原。
- 掃描限Solution還原圖及ProjectReference閉包，避免納入旁邊Tools或舊assets。
- 掃描前增加可尋找的Console說明。
- 可選成品名稱／JSON檔名，預設SBOM/bom.json；支援CycloneSBOM/PrimeX.cdx.json。
- 修正CycloneDX Spec Version資訊顯示Link；升版、打包、上傳及Azure驗證。

## 驗收

- 真實Solution僅一次dotnet restore；SDK選擇、NuGet認證及既有鎖檔保護保留。
- 無關／過期還原資料不被scanner讀入；自訂排除與assets完整性維持。
- 舊目錄／其他模式相容；新增欄位有安全驗證、預設與自訂輸出測試。
- CLI範圍／參數及Schema驗證、實際VSIX與Azure預設／自訂成品驗證；紀錄差異及限制。
