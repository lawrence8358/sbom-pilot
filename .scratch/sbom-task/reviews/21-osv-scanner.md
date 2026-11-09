# 工單21：OSV、風險／CVE 報告及 CI 摘要

## 交付狀態

使用者要求撤回本機提交，HEAD 已回原 `7dd8827`；所有程式／文件保留為未提交變更，分支 `feature/osv-scanner`。未 push、未上傳市集、未 queue Azure Pipeline。使用者原始 `差異/` 參考檔未修改。

本機安裝包 `packages/private/LawrenceShen.sbom-pilot-0.1.4.vsix`，SHA-256 `dcc00da1cb646953c1c66867ed001b97b414f48b3cb55e6546cf7a5252d4cebc`。Submission `packages/submission/private/LawrenceShen.sbom-pilot-0.1.4-B3i0NJ`。報告範例 `.smoke/21/sbom.osv.md` 為真實OSV2.7.1掃描lodash4.17.15結果，與使用者產品無關。

## 功能

- runOsv 預設true且位於DT勾選框上方；osvVersion預設latest，支援穩定精確版本。
- Node讀官方Latest轉址後固定tag，binary與checksum同tag；Windows/Linux x64/arm64檔名選擇，檢查SHA-256／實際版本／CLI。
- Agent.ToolsDirectory依版本／平台／架構快取；warm先hash及版本校驗，無重複下載。
- 單次OSV JSON掃描，使用標準檔名複本支援任意合法SBOM檔名；由官方group.max_severity及aliases產生Markdown風險分級、CVE、修復版本、分級數量及排序。
- 同份sbom.osv.md送相同Build Artifact及task.uploadsummary；摘要官方入口Extensions，真實Services/Server UI未驗收。
- 弱點exit1只警告；技術失敗、JSON缺失／格式不相容皆失敗，OSV/DT/成品/摘要錯誤保留且各自嘗試發佈。
- 預設SBOM檔名改sbom.cdx.json；既有明確自訂檔名保留。

## 驗證

- `npm test`：136/136，包含新增版本／快取／報告／Summary與錯誤政策；`.smoke/21/unit.log`。
- `npm run typecheck`、format:check、check:source-comments（200/200）、check:source-spacing（0）通過。
- 原Azure SDK輸入測試曾遇共用.taskkey競態；改用隔離Agent.TempDirectory後完整136通過。
- Windows Node24.22.1／Linux容器Node24.22.2真OSV2.7.1：官方latest下載校驗、有弱點／無弱點API查詢、自訂檔名、Markdown風險／CVE、快取重用mtime不變。證據 `.smoke/21/{win32-x64,linux-x64}/evidence.json`。
- Linux新報告／runner／workflow聚焦15項通過；末次補強略過OSV合法但不含package的GIT affected記錄後，Windows／Linux各14項OSV聚焦通過。
- 真CLI packaging測試1/1；正式身分private VSIX打包通過。
- 最新包Windows Node20.20.2／24.22.1 × dist／VSIX四入口通過；Linux Node24.22.2 × dist／VSIX兩入口通過。
- 實際解包Task：Windows Node24 的OSV預設開啟／關閉／成品故障三案例，Linux Node24的OSV預設開啟案例通過；確認兩個成品命令、同份保留報告及task.uploadsummary。Linux完整案例執行於最後一項package缺省補強前；補強後有上述聚焦與最新包入口驗證。均為本機SDK/成品adapter，不宣稱真正Azure非同步上傳通過。
- 最新包另以Windows Node20.20.2執行完整OSV預設開啟案例通過，證據 `.smoke/21/windows-node20-final/evidence.json`；確認同份SBOM與Markdown成品、同份Summary、秘密遮罩及原檔不變。

## 序列獨立審查

- Standards 初次1項P2：工單缺Blocked by導致resume失敗；已補Blocked by:20，resume可用。
- Spec 初次無其他重要問題。
- 新JSON／風險／CVE／Summary完成後獨立複查：Standards／Spec均無重要發現。

## 未驗證範圍

0.1.4 Marketplace、真實Services／Server安裝、Extensions呈現及非同步成品／摘要失敗、arm64硬體、企業Proxy／CA／client certificate。保留歷史0.1.3發布事實，不視為本輪驗收。

## 使用者指定中間版號：0.2.0

- 已同步package／lock／Task／extension為0.2.0，維持SbomPilot@0。
- 正式public包：packages/public/LawrenceShen.sbom-pilot-0.2.0.vsix（519530 bytes）。
- SHA-256：f6bbcf4c89db5dab1e3dc8741ae63b8462f8a260aec5a7c69c5bae0d2d222c91。
- 交付目錄：packages/submission/public/LawrenceShen.sbom-pilot-0.2.0-awfqgv。
- packaging:check／package（內含archive、身分、public旗標、來源新鮮度校驗）及Node20/24的dist／VSIX四入口通過。僅版號及文件調整，不重跑未受影響的功能測試。
- 使用者會手動上傳；未commit、merge、push、上傳或啟動CI。0.1.4候選包保留為歷史，後續以0.2.0為交付。
