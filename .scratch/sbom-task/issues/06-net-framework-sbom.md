# 06: 傳統 .NET Framework 專案完成 SBOM 流程

Status: ready-for-agent
Blocked by: 05

**What to build:** 使用者可在 Windows Agent 選擇 .NET Framework 模式，沿用既有 .NET 流程並依傳統專案格式還原依賴，產生及發佈 SBOM；必要的傳統工具鏈由 Agent 提供。

## Acceptance criteria

- [ ] 支援辨識 SDK-style／傳統格式、PackageReference／傳統套件清單的差別，採取符合所選工具版本的還原方式，不僅以 Framework/Core 名稱猜測行為。
- [ ] 使用 Agent 預裝的 Visual Studio Build Tools、MSBuild 與必要 workloads；一般 NuGet 工具由 Task 準備，缺少傳統工具或 targets 時清楚指出項目，不在掃描過程自行安裝整套 Visual Studio 工具鏈。
- [ ] 傳統套件清單及非 SDK-style PackageReference 專案各有代表性還原、掃描、有效 SBOM 與成品發佈案例；已使用的鎖定資訊保持有效。
- [ ] 未使用選用 NuGet lockfile 的合法傳統專案可成功執行；不因沒有 npm 類型檔案或選用 lockfile 被拒絕。
- [ ] .NET Framework 模式使用 Windows；遇到不支援的平台在開始前回報明確原因，不承諾所有專案類型均可跨 OS 執行。
- [ ] 驗證缺少 MSBuild/workloads、還原失敗及傳統專案成功案例；README 列出支援格式、工具需求、Windows 條件與可操作範例。

## Comments

- 使用者已核可本工單及其阻擋關係；遵循「Task 準備一般工具、Agent 提供傳統工具鏈」的既有領域決策。
