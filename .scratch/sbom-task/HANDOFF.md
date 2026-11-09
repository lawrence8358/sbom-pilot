# SBOM Pilot 續接入口

## 最新授權：提交與推送 0.2.0

使用者已明確要求 commit 並推上 GitHub，覆蓋本輪先前的未提交限制；目前依此授權整合並推送 origin/main。市集仍由使用者手動上傳，不建立 GitHub Release、不啟動雲端 CI。下方未提交狀態為歷史；完成回讀紀錄見21 checkpoint。

## 本輪追加 0.2.0／工單21（2026-11-09，未提交）

使用者指定中間版號0.2.0，最新上傳用包packages/public/LawrenceShen.sbom-pilot-0.2.0.vsix，將由使用者手動上傳。

使用者已確認OSV全部模式預設啟用、官方Latest／精確版本、同Agent校驗快取、弱點警告但技術失敗，報告和SBOM同成品；追加預設sbom.cdx.json、OSV選項在DT上方、逐列風險／CVE及CI Extensions直接查看。

使用者要求取回本機commit，已mixed reset回原7dd8827，所有修改保留在feature/osv-scanner工作區。**不得自行commit、merge、push或發布。** 原有差異/是使用者未追蹤參考資料，勿修改／提交，其中歷史設定勿回顯。

讀[21 checkpoint](checkpoints/21.md)及[完整規格](../osv-scanner/spec.md)接續；state保留active ticket21，不能把舊0.1.3完成狀態當成本輪完成證據。原歷史記錄如下。

## 最新交付 0.1.3（2026-11-08）

工單[20](issues/20-release-docs-and-stage-logs.md)完成。實作b790c5d；八階段綠色標題（DT關閉則略過）、共用參數規劃、README唯一市集介紹、GitHub絕對文件／圖片、刪除CHANGELOG及重複overview、VSIX精簡且保留runtime授權。

122單元、packaging CLI1項、Node20／24四入口、正式包四個真實解包案例皆通過，序列獨立Standards／Spec均0發現。正式包packages/public/LawrenceShen.sbom-pilot-0.1.3.vsix，512045bytes，SHA256 c0ee835e6769505c02dffd612168eb53ecc6762190165d4cd8408d0d6ed8bb84；submission public/LawrenceShen.sbom-pilot-0.1.3-O2rmRK，62個hash符合。

Marketplace Public0.1.3已驗證，公開介紹已取回核對；GitHub main已push、公開圖片／文件HTTPS200，[GitHub Release v0.1.3](https://github.com/lawrence8358/sbom-pilot/releases/tag/v0.1.3)與VSIX已公開，雲端資產hash相符。Azure85 [run2738](https://primeeagle.visualstudio.com/PrimeEagleX/_build/results?buildId=2738)成功，Task0.1.3／ubuntu24.04／Node24，7個已執行階段綠色標題可見、1次方案restore、223組件。artifact2175 SBOM/bom.json實際下載534763bytes再過Schema1.6。沒有儲存修改Pipeline設定。本次無未完成驗收；[review](reviews/20-release-docs-and-stage-logs.md)、[checkpoint](checkpoints/20.md)。整合分支改為main，使用者已授權並完成遠端push，舊的禁止remote條款屬歷史。以下版本為歷史紀錄。

## 最新追加修正 0.1.2（2026-11-07）

[19方案還原與成品設定](issues/19-solution-restore-and-artifact-options.md)已完成，實作9797323；正式包packages/public/LawrenceShen.sbom-pilot-0.1.2.vsix，SHA256 06b0cda09bb1c23bc08af7f58408e0297b30450e9aafbd9abd1990f40b412475，submission public/LawrenceShen.sbom-pilot-0.1.2-53kFmS（109項hash符合）。122測試、雙Node與真實方案／PortalBackend測試通過。指定方案／專案單次還原且掃描限還原圖；新增成品名稱／檔名預設SBOM/bom.json、掃描section、SpecVersion說明。

Marketplace Public0.1.2已上傳且完成驗證。原Pipeline85：run2734預設SBOM/bom.json、run2735自訂CycloneSBOM/PrimeX.cdx.json皆成功，Task版本0.1.2，各1次方案restore、17個圖內專案、223組件。Artifacts2171／2172皆非同步上傳完成、實際下載並再驗證Schema1.6。Classic info與欄位已檢查，測試後Pipeline恢復預設名稱、Save並刷新回讀確認。詳見[驗證紀錄](reviews/19-solution-restore-and-artifact-options.md)及[checkpoint](checkpoints/19.md)。本輪無未完成驗收，以下0.1.1／0.1.0為歷史紀錄。

## 最新追加修正 0.1.1（2026-11-07）

[18 .NET Core 專案檔路徑](issues/18-dotnet-project-file-path.md) 的本機實作已提交 `1bb265f`。最新正式包是 `packages/public/LawrenceShen.sbom-pilot-0.1.1.vsix`，SHA256 `fb05c2f4ec10ed7d28f4cf81f3bc814cab61c7b1f255a249f4881e84eadc5b52`；交付資料 `packages/submission/public/LawrenceShen.sbom-pilot-0.1.1-VojLtl`，109項SHA全過。下方0.1.0屬歷史交付。

原0.1.0在有效PrimeEagleX.Backend.sln重現「專案路徑必須是目錄」；0.1.1已支援.NET方案／專案檔轉所在目錄，完整119測試、3項新回歸雙Node、真CLI及4組dist／VSIX入口通過。使用真實PortalBackend與相對.sln執行封裝內Task成功，267組件、Schema1.6驗證通過。使用者專案來源WIP未修改。

使用者授權繼續Chrome後，0.1.1已上傳Marketplace並完成驗證；[Azure run2733](https://primeeagle.visualstudio.com/PrimeEagleX/_build/results?buildId=2733)在原definition85／master／ubuntu-24.04設定成功，日誌確認Task0.1.1。Task1m58s、job2m3s；artifact2170／SBOM/bom.json已成功非同步上傳且實際下載，再驗證Schema1.6通過，229組件。下載BOM SHA256 `a7575019cccbb4ce18ba40bc635f2777a11570d7df69a1aa84edc4dc809d7a88`。工單18resolved，沒有未完成的本輪工作。續接可讀[18 checkpoint](checkpoints/18.md)與[驗證紀錄](reviews/18-dotnet-project-file-path.md)，無需重跑已通過的矩陣。

01–16 本機實作與獨立審查完成；[17 圖示過大修正](issues/17-marketplace-icon-size.md) 已於2026-11-06取得同意、完成本機縮圖及封裝驗證。沒有未完成的本機實作或執行中測試；市集實際上傳與Azure安裝仍待驗收。

17 新圖示為256×256、60,594 bytes，保留原設計。preflight／archive檢查、1024 KB精確邊界、真CLI及Node20/24四組檢查全過。最新正式包仍在packages/public/LawrenceShen.sbom-pilot-0.1.0.vsix；SHA256 35f995b420ec1523056aeee4037fac8dec87356220bf0d2b3abe47b46d86a039。交付目錄改為packages/submission/public/LawrenceShen.sbom-pilot-0.1.0-0wMWgX，109項hash通過。詳見[17驗證](reviews/17-icon-size.md)及[checkpoint](checkpoints/17.md)。以下舊HUW3Lx與preview屬歷史產物，含超標圖示，不可用來重試上傳。

## 恢復事實

先執行 node scripts/resume.mjs，核對 Git 與 implementation-state.json。整合分支為 feature/sbom-pilot，沒有遠端，不 push、不建立 PR。若使用者有新需求，再建立追加工單；不要把舊 checkpoint 中的歷史進行中狀態當成現在的工作。

## 最後完成內容

- 01–14：Task 核心、四模式、認證／工具／驗證、README／Dev Mermaid、中文函式用途及重構；審查見 [原總表](reviews/report.md)。
- 15：函式／責任區塊空白、JavaScript／TypeScript 通用前端與 legacy vue、實際 exe／argv／cwd 及原生 HTTP 診斷。秘密遮罩與 Agent logging command 跳脫已修正；見 [15總表](reviews/15-report.md)。
- 16：五個 packaging 指令、preview/private/public、一次性 PNG、overview／上架文件、來源／dist／VSIX 及交付雜湊檢查。清單共用及 Bash 設定修正候選 b231a69，獨立 merge f70fe2b；兩軸未解決0，見 [16總表](reviews/16-report.md)。
- 使用者要求最多一位子代理；所有實作、整合與審查皆序列執行。額度中斷從原 checkpoint 接續，沒有重做舊矩陣。

## 目前可用產物

- **最新上架用正式包（2026-11-06，圖示已縮小）**：packages/public/LawrenceShen.sbom-pilot-0.1.0.vsix；Publisher LawrenceShen、public:true、Repo https://github.com/lawrence8358/sbom-pilot，已核對實際archive。
- 正式交付資料：packages/submission/public/LawrenceShen.sbom-pilot-0.1.0-0wMWgX；109檔SHA全部通過。VSIX 1869147bytes，SHA256 35f995b420ec1523056aeee4037fac8dec87356220bf0d2b3abe47b46d86a039；runtime仍c937...，Node20/24四組dist/VSIX probes通過。見[圖示修正紀錄](reviews/17-icon-size.md)。舊身分設定的歷史見[正式包紀錄](reviews/publisher-release.md)。
- 舊placeholder預覽與dev包不可上傳到LawrenceShen；以下預覽資料是歷史產物，對應當時來源，最新正式文件已更新。

- 上架操作：[docs/marketplace.md](../../docs/marketplace.md)，使用者入口：[README](../../README.md)，維護者入口：[README-Dev](../../README-Dev.md)。
- 最新預覽：packages/submission/preview/local-dev-placeholder.sbom-pilot-0.1.0-EbqmRP，109檔SHA256一致。
- preview VSIX：packages/preview/local-dev-placeholder.sbom-pilot-0.1.0.vsix，3789348 bytes，SHA256 8cf9d81634b85c75c936d5d39cbc170552fb90dd00ddb6a4e3fda290371c7af9。
- 舊入口 dev VSIX：packages/local-dev-placeholder.sbom-pilot-0.1.0.vsix；其最新hash見 [最後整合](reviews/16-final-integration.md)。
- runtime SHA256 c937caf650b101fd888ece192c7391976da4a3fdb401179e668071e4e9a1388f，與工單15相同；PNG原封保存，打包不呼叫AI。
- 指令：npm run packaging:install-tool；npm run packaging:preview。填入實際 SBOM_PILOT_PUBLISHER 與 SBOM_PILOT_REPOSITORY_URL 後，可用 packaging:package -- --private 或 packaging:package。

## 驗證與證據

Windows/Linux 本機／Docker 的116測試、175中文用途、spacing0、型別／格式、受影響真實流程與雙Node入口已通過。最後小修只重跑受影響真CLI完整性、雙平台fresh preview及root新舊ZIP Node20/24 probes，沒有把歷史完整矩陣說成本輪重跑。root .smoke/review-15、review-15-safety、review-16、review-16-final 保存精簡證據；[最終檢查點](checkpoints/final.md)及 [16最後整合](reviews/16-final-integration.md)保存版本／命令／hash。

## 尚待外部資料與環境

2026-11-06已確認Publisher LawrenceShen，使用者另提供 https://github.com/lawrence8358/sbom-pilot，匿名讀取可見空Repo；已設定來源manifest、更新文件並重建正式包，Publisher mismatch本機對照由紅轉綠。尚未上傳市集或推送Git，root仍無remote。Publisher權限／成功上傳、Repo程式內容與版本對應、Services/Server安裝、Classic/YAML UI、成品下載／非同步失敗、企業feeds／Proxy／CA／client certificates、arm64仍待驗收。

## 清理界線

本輪只清理已完整合併且乾淨的15原工單、15安全修正及16工作區；分支／提交與root證據保留。結果見 [本輪清理](reviews/current-worktree-cleanup.md)。舊03／05／07／09／13未註冊殘留與被拒刪除的temp維持原狀，禁止替代方式重試；歷史見 [清理紀錄](reviews/worktree-cleanup.md)。Docker容器／volume保留證據，不處理無關資源。
