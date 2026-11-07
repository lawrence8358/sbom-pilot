# 18: .NET Core 專案檔路徑被目錄驗證拒絕

Type: task
Status: claimed
Blocked by: 17

## 問題

Azure DevOps definition 85、run 2732，Task 0.1.0 在 .NET Core 模式填入 PrimeEagleX.Backend.sln 時拋出 `[參數驗證] 專案路徑必須是目錄。`。已以使用者提供的 PortalBackend 實際檔案重現；相對及絕對路徑均失敗，目錄通過。

## 驗收

- .NET Core／Windows .NET Framework 接受既有目錄或 .sln／.slnx／.csproj／.fsproj／.vbproj，將檔案所在目錄作為既有遞迴還原／掃描根目錄；說明此範圍不依 solution 成員過濾。
- JavaScript／TypeScript 及合併產品繼續要求目錄，不接受任意檔案或不存在路徑。
- 以回歸測試驗證相對／絕對／空白路徑、實際 scanner 的 argv/cwd 與有效成品發佈。
- 升版 0.1.1，建立 LawrenceShen 正式 VSIX，核對封裝及真實專案；有權限則上傳並實際重跑 definition 85。
