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
- README 的20項輸入皆有文件、全部連結HTTPS且GitHub目標本機存在；GitHub main推送後，README／hero／認證文件HTTPS均200。

## 遠端驗證

- GitHub main已推送，來源b790c5d與後續交付文件均納入；公開README、hero與文件讀取200。
- Marketplace正式Public0.1.3已驗證完成；公開頁與CDN Content.Details取回新版README，階段說明與GitHub raw圖片URL符合。
- [Azure definition85 run2738](https://primeeagle.visualstudio.com/PrimeEagleX/_build/results?buildId=2738) Success；master78ef08f4、ubuntu24.04/x64、Agent5.281.1、Node24 handler、Task0.1.3。Task1m4s／job1m8s。
- 原設定的.NET Core、方案PrimeEagleX.Backend.sln、預設排除、SBOM/bom.json與DT關閉保留；只對此次queue選ubuntu24.04，未儲存更改definition。
- raw job log確認七個實際執行階段section、DT略過訊息、一次方案restore、223組件、沒有error marker。Azure UI綠色標題實際可見。
- 成品2175非同步上傳成功，實際下載534763bytes，223組件，正式CycloneDX1.6 Schema再次通過。BOM SHA256 63cc2fffee5f39fc0e3aa17279b6c4a8ec9c86fb7b25dcd10395acb1630e5b0d。
- 機器證據.smoke/20/azure-2738-evidence.json；原始log、BOM、UI及公開市集證據留在忽略的.smoke/20，不提交使用者產品內容。

本次要求已完成；Server／YAML／arm64／企業網路及企業DT等未測環境仍獨立列為UNVERIFIED，不以Services Classic或loopback結果代替。
