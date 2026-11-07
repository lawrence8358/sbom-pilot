# 0.1.3 驗證與審查

## Standards

基準 355f133 至 b790c5d；依 AGENTS、CONTEXT、ADR 與程式責任規範，獨立代理審查無發現。必要授權、單次掃描與既有介面保留。

## Spec

另一代理獨立審查工單20與需求，無發現。兩軸依使用者要求序列執行，沒有平行子代理。

## 本機驗證

- 122/122 單元測試；型別、格式、179個具名函式說明、間距通過。
- 真實隔離包裝 CLI 1/1：私有／公開 VSIX、竄改／舊來源拒絕與精簡 payload。
- 正式 VSIX：512,045 bytes；SHA256 c0ee835e6769505c02dffd612168eb53ecc6762190165d4cd8408d0d6ed8bb84。
- packages/public/LawrenceShen.sbom-pilot-0.1.3.vsix；submission public/LawrenceShen.sbom-pilot-0.1.3-O2rmRK。
- dist／VSIX 在 Node20.20.2／24.22.1 四入口通過（SDK 真實資源／程序／glob、遮罩、runtime 授權）。
- 正式包解出 handler 實際執行 npm、成品adapter故障、私有 .NET Core DT403、私有 combined DT成功；驗證8階段標題順序、跳過DT、失敗後同檔成品及Schema。
- 機器證據 .smoke/20/npm-evidence.json、dt-evidence.json。日誌 .scratch/sbom-task/20-*.log 忽略不提交。
- README 的20項輸入皆有文件、全部連結HTTPS且GitHub目標本機存在；公開URL待push後驗證。

## 待完成

GitHub main push、公開連結、市集上傳與實際Azure驗證。未推定 Server／YAML／arm64／企業網路已通過。
