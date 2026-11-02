# 05: 現代 .NET 專案完成還原與 SBOM 流程

Status: ready-for-agent
Blocked by: 01

**What to build:** 使用者選擇 .NET Core／現代 .NET 模式後，單一 Task 自行準備相容的一般 SDK/NuGet 工具，還原公開依賴，產生交付產品的 SBOM 並發佈成品。

## Acceptance criteria

- [ ] Task 介面與 YAML 可選現代 .NET 模式，並使用共同的參數驗證、掃描、SBOM 驗證及成品發佈流程。
- [ ] 遵循專案的 SDK 版本宣告及專案格式，準備相容 SDK/NuGet 工具並完成還原；不能唯一決定還原方式或版本時指出原因及可採取的修正。
- [ ] 代表性專案的直接與可取得間接依賴進入 SBOM；安裝階段與掃描階段分工，不將缺少還原資料的結果誤判為完整依賴清單。
- [ ] 已有 NuGet lockfile 時遵循其鎖定資訊；未選用該機制的合法專案不會因沒有 lockfile 被誤拒，也不要求 npm 類型的鎖檔。
- [ ] required-only 與預設 Spec 1.6 生效；還原、SDK 不相容、掃描或成品發佈失敗均回報正確階段。
- [ ] 驗證宣告 SDK、缺少選用 lockfile、間接依賴及失敗案例；一般公開來源的 Windows/Linux 執行結果按實測記錄，不把未測組合標為已支援。
- [ ] README 更新 .NET 模式的前置條件、SDK 選擇、還原行為、限制與 Classic Build/YAML 範例。

## Comments

- 使用者已核可本工單及其阻擋關係；本張建立一般 .NET 還原流程，06 延伸傳統專案支援。
