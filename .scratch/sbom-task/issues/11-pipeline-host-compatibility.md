# 11: 驗證 Services/Server 與 Classic/YAML 執行入口

Status: ready-for-agent
Blocked by: 01

**What to build:** 使用者能在宣告支援的 Azure DevOps Services 或 Server 中安裝同一 Extension，透過 Classic Build 或 YAML 完成最小公開 npm 交付產品的掃描並下載 SBOM。交付可查證的支援版本與執行環境組合。

## Acceptance criteria

- [ ] 用 01 的最小完整流程驗證 VSIX 安裝、Task 欄位、工具準備、SBOM 產生與成品下載，Services 與 Server 各有實際環境版本及結果紀錄。
- [ ] Classic Build 與 YAML 使用同一 Task，參數與版本語意一致；不把原生成品上傳受限的 Classic release 直接宣稱為同樣支援。
- [ ] 檢查 Task handler 與 Agent 的啟動相容性，與 cdxgen 使用的 Node 工具版本分開管理；下載 Node 不被當作修復啟動前缺少 handler 的手段。
- [ ] 明列支援的 Server 更新版與其官方允許的 Agent 配對、handler、OS、實際工具版本及測試結果；最低 Server 版本不能僅由一個 Node/Agent 版本推算。
- [ ] 最小 npm 流程有 Windows/Linux 的適用組合驗證；缺少環境或尚未測試者如實標記，不能以官方介面宣告取代端到端測試證據。
- [ ] 採同時適用 Services/Server 的 Build Artifact 發佈方式；驗證有效 SBOM 可下載及發佈失敗時 Task 的結果。
- [ ] README 列出安裝、Classic Build/YAML 操作、相容矩陣與前置條件；必要相容性修正需有對應回歸驗證。

## Comments

- 使用者已核可本工單及其阻擋關係；本張先驗證最小流程，所有專案類型的最終整合由 12 驗收。
