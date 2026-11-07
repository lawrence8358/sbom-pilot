# 18: .NET Core 專案檔路徑被目錄驗證拒絕

Type: task
Status: resolved
Blocked by: 17

## 問題

Azure DevOps definition 85、run 2732，Task 0.1.0 在 .NET Core 模式填入 PrimeEagleX.Backend.sln 時拋出 `[參數驗證] 專案路徑必須是目錄。`。已以使用者提供的 PortalBackend 實際檔案重現；相對及絕對路徑均失敗，目錄通過。

## 驗收

- .NET Core／Windows .NET Framework 接受既有目錄或 .sln／.slnx／.csproj／.fsproj／.vbproj，將檔案所在目錄作為既有遞迴還原／掃描根目錄；說明此範圍不依 solution 成員過濾。
- JavaScript／TypeScript 及合併產品繼續要求目錄，不接受任意檔案或不存在路徑。
- 以回歸測試驗證相對／絕對／空白路徑、實際 scanner 的 argv/cwd 與有效成品發佈。
- 升版 0.1.1，建立 LawrenceShen 正式 VSIX，核對封裝及真實專案；有權限則上傳並實際重跑 definition 85。

## Answer

修正與0.1.1已提交1bb265f，Marketplace已上傳並完成驗證。保留definition85原設定（.NET Core、PrimeEagleX.Backend.sln、0.*、預設排除、DT關閉），以master78ef08f4在Azure Pipelines ubuntu-24.04啟動run2733成功。

- 日誌確認Version0.1.1，Task1m58s／job2m3s，原目錄驗證錯誤已消除。
- Agent非同步上傳成功，artifact2170／SBOM/bom.json可下載。
- 下載檔550,201bytes，CycloneDX1.6 Schema重新驗證通過，229組件、173筆非空dependsOn記錄；SHA256 a7575019cccbb4ce18ba40bc635f2777a11570d7df69a1aa84edc4dc809d7a88。
- 本機119測試／真packaging CLI／109交付hash／雙Node入口通過，另有本機PortalBackend完整實跑267組件。

執行結果：https://primeeagle.visualstudio.com/PrimeEagleX/_build/results?buildId=2733 。詳細證據見[驗證紀錄](../reviews/18-dotnet-project-file-path.md)。
