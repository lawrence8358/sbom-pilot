# 版本說明

## 0.1.0 — 本機交付候選版（2026-11-03）

- 單一 **SBOM Pilot — Generate & Upload SBOM** Task：Vue/npm/pnpm/Yarn、.NET Core、Windows .NET Framework、.NET Core 前後端合併，Classic Build 與 YAML 共用參數。
- 自行準備受驗證的 Node24、cdxgen13.6.0、精確管理器與一般 .NET SDK；前端嚴格鎖檔、NuGet 選用鎖檔、SDK/MSBuild 還原圖與 nupkg 完整性。
- 一份 required-only CycloneDX1.6、官方 Schema 驗證及 SBOM Build Artifact 請求。Yarn workspace 會保留部分被上游標為 required 的開發套件，未承諾逐項部署核對。
- 選填私有 npm/NuGet 認證，保留來源設定，僅 install/restore 取得匹配秘密；SDK 初始化前遮罩。工具、scan、DT 不取得來源認證。
- 選用 DT 既有 UUID，以接受 token 結束；有限逾時／重試、預設 TLS，失敗仍要求發佈同一有效成品再失敗。成品上傳由 Agent 非同步處理。
- Agent Proxy/CA、雙 Node20_1/Node24 handler、原生安全 Node 解壓／原子快取、UTF-8。最終 VSIX 的 Windows/Linux 冷啟動、私有合併與 Framework 有本機實測。
- MIT／Lawrence Shen、正體中文文件、可重跑的最終套件驗證、runtime 告示與套件內文件連結。移除未使用 tool-lib／SDK 測試下載器分發，保留真正 SDK 執行資源。

此為 Local Development VSIX，尚未公開 Marketplace。實際 Publisher ID／公開 Repo URL 未提供；真實 Services/Server 安裝、Classic/YAML UI、原生成品下載／故障傳播及 arm64 仍 UNVERIFIED。audit 有一項上游 minimatch moderate advisory，無相容修正版，無 high/critical。範圍與手動步驟見 [相容性](docs/compatibility.md)，建置／正式包裝見 [開發說明](README-Dev.md)。
