# 10: 私有 NuGet 來源完成還原與掃描

Status: ready-for-agent
Blocked by: 06

**What to build:** .NET Core 與傳統 .NET Framework 交付產品可在同一 Task 中，沿用既有 NuGet 來源並以 Secret Pipeline Variables 完成私有來源認證、依賴還原、SBOM 產生及成品發佈。

## Acceptance criteria

- [ ] 明列私有 NuGet 認證欄位、來源對應及驗證方式；沿用既有來源及還原設定，不另建 Service Connection 類型，不要求額外 Authenticate Task。
- [ ] 認證可正確提供給 SDK-style、傳統套件清單與非 SDK-style PackageReference 所採用的還原工具；不依賴只能在原機器及原使用者解密的既有密碼設定。
- [ ] 公開及私有來源可並存，保留 SDK 宣告、既有鎖定資訊與代理設定；不同來源的憑證不誤套，無憑證的公開來源仍可正常使用。
- [ ] .NET Core 與傳統 Windows .NET Framework 各有代表性認證成功、有效還原、SBOM 產生及成品發佈紀錄；失敗時指出來源及階段，不洩漏認證內容。
- [ ] 暫存認證不寫回版本庫、不進入成品，成功或失敗後均清除；傳統 MSBuild/workloads 仍由 Agent 提供，不因私有來源功能改變工具責任邊界。
- [ ] 驗證正確認證、錯誤認證、多來源及清理行為；README 提供欄位、Secret Variables 設定、前置條件與各專案格式的使用說明。

## Comments

- 使用者已核可本工單及其阻擋關係；依 06 沿用已支援的.NET Core 與 .NET Framework 還原路徑。
