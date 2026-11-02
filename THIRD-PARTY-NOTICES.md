# 第三方資源

SBOM Pilot 採 MIT，作者 Lawrence Shen。完整文字隨 LICENSE 提供；第三方保留原始授權。

src/schemas/ 的 bom-1.6、spdx、jsf-0.82 JSON Schema 取自 [CycloneDX specification 1.6 tag](https://github.com/CycloneDX/specification/tree/1.6/schema)，未修改，依 Apache-2.0 提供；完整授權附於 dist/schemas/LICENSE。CycloneDX 是 OWASP Foundation 的專案。

handler 含 AJV、格式驗證、yaml、jsonc-parser、semver、https-proxy-agent 及其可達相依。Azure Pipelines Task SDK 真正 task.js 執行 closure 另包在其原套件目錄，保留 package metadata、MIT LICENSE、原始 ThirdPartyNotice 及所有非程式資源。上游 ThirdPartyNotice 不代表產品實際包含其列出的每個套件。

dist/licenses/manifest.json 從兩份實際 esbuild metafile 產生，目前25筆，記錄名稱、版本、上游授權及完整告示路徑；runtime-inputs.json 保存兩個 bundle 的來源清單。建置及套件驗證檢查告示可讀，包含 YAML 的 ISC 及格式驗證的相依。未使用的 SDK mock harness、nodejs-file-downloader、tool-lib 不在 VSIX；沒有 stub。開發 npm tree 仍可能依 SDK metadata 安裝測試下載器，但產品未使用或分發它，未自行補造其缺漏 ISC 告示。

cdxgen（Apache-2.0）、Node.js、套件管理器及 .NET SDK 於執行時由各官方來源下載，不包含於 VSIX；其原始授權繼續保留。專案依賴依各自來源與 SBOM 資料為準，FETCH_LICENSE 不保證私有 metadata 可匿名取得。
