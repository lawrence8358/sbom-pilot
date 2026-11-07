# 第三方授權

SBOM Pilot 採 MIT，完整文字見 LICENSE。第三方程式與資料保留各自的原始授權。

- 隨附的 CycloneDX 1.6、SPDX、JSF JSON Schema 來自 [CycloneDX specification 1.6](https://github.com/CycloneDX/specification/tree/1.6/schema)，未修改，Apache-2.0 全文位於 dist/schemas/LICENSE。
- Task 執行程式包含 Azure Pipelines Task SDK、AJV、YAML、jsonc-parser、semver、https-proxy-agent 與實際使用的相依。完整原始授權與版本清單隨 VSIX 的 dist/licenses/manifest.json、dist/licenses/*.txt 及 SDK 目錄分發。建置依實際 bundle 輸入產生清單並檢查授權檔案。
- Node.js、cdxgen、套件管理器與 .NET SDK 在執行時從官方來源取得，不包含在 VSIX；下載內容保留上游授權。
