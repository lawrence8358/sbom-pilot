# SBOM Pilot 需求規格

Status: ready-for-agent
Implementation: complete locally; external acceptance pending

原始需求：[需求.md](../../需求.md)。使用者已核可需求及工單拆分，並授權依本規格在本機開發分支實作；目前沒有遠端 Repo，不建立 PR。

## 已確認

- Q1：支援 Azure DevOps Server 與 Azure DevOps Services、Classic 與 YAML Pipeline、Windows 與 Linux Agent。最低 Server／Agent 版本與各類專案可支援的作業系統組合仍待查證；「全部」未直接解讀為支援所有歷史版本或包含 macOS。
- Q2：合併專案以前後端共同作為交付產品；產品邊界見 [ADR-0001](../../docs/adr/0001-combined-project-product-boundary.md)。
- Q3：Task 自行完成專案依賴的 restore／install，避免依賴額外 Pipeline 步驟。工具責任邊界見 Q6；具體版本、來源認證與網路政策仍待確認。
- Q4：目標為排除不交付生產端的開發依賴，指定採用 cdxgen `--required-only`；具體篩選行為以所選 cdxgen 版本的 required scope 為準，不再要求使用者選擇另一種盤點目的。
- Q5：產生 SBOM 失敗時 Task 失敗；啟用 DT 上傳後，上傳失敗也使 Task 失敗，但仍保留並發佈已成功產生的 SBOM 成品。第一版不加入根據弱點門檻阻擋建置的功能。
- Q6：採 A：以單一 Task 完成一般工具準備及專案依賴安裝，不要求額外 NodeTool／restore／install 步驟；傳統 .NET Framework 專案所需 Visual Studio Build Tools／MSBuild／workloads 由 Agent 預裝。缺少必要工具時應明確報錯。
- Q7：使用者要求依原始合併專案範例理解需求；掃描基準見下節，並未採用上一輪建議的「前後端各一個必填掃描路徑」。
- Q8：接受明訂最低 Server／Agent 版本及各專案類型適用的 OS 組合；.NET Framework 模式使用 Windows Agent，不以 Windows／Linux 支援目標推導每個專案類型都能在兩者執行。
- Q9：採一個共用的「排除規則」欄位，以相對於共同根目錄的 glob 區分前後端目錄；不增加前後端各一組排除欄位。逗號分隔多個規則時須保留 glob 花括號中的逗號。
- Q10：前端套件依賴安裝要求 lockfile 存在且與 manifest 一致；缺少或不同步時失敗並說明原因，不在執行時重新解析並更新 lockfile。此結論來自 package.json／pnpm-lock.yaml 的情境，不代表所有傳統 .NET 專案都必須新增 lockfile。
- Q11：DT 預設驗證 TLS 憑證；提供進階「略過 DT TLS 憑證檢查」選項，預設關閉。
- Q12：DT API 確認接受上傳即算上傳完成，不等待背景匯入或弱點分析。日誌標示「已接受上傳」，避免宣稱匯入已完成。
- Q13：cdxgen 預設使用隨 Task 發佈、經本專案驗證的固定版本，提供進階版本覆寫欄位；Node.js 可設定，預設最新符合 `24.x` 的版本。
- Q14：第一版支援 npm、pnpm、Yarn，依專案宣告及 lockfile 自動判斷；資訊矛盾時報錯，不任意猜測。套件管理器版本優先依專案宣告。
- Q15：沿用 Repo 的套件來源設定，另提供選填認證欄位，由 Secret Pipeline Variables 傳入；Task 自行準備認證，不要求額外 Authenticate Task，第一版不新增 Service Connection 類型。
- Q16：採用授權補充、停用 cdxgen 快取的預設與進階開關；預填共通排除 glob，專案特有排除由使用者提供；固定發佈 `SBOM` 成品、輸出路徑內部管理。掃描路徑、排除規則、Spec Version 不受 DT 開關影響；DT 開關只控制連線、專案識別、API Key 與 TLS 設定。
- Q17：專案與 Extension 正式名稱為 **SBOM Pilot**，識別名稱為 `sbom-pilot`，Pipeline Task 顯示名稱為 **SBOM Pilot — Generate & Upload SBOM**。
- Q18：README 以正體中文為主、面向使用者導入，涵蓋功能介紹、支援範圍、安裝方式、Classic／YAML 快速開始、參數表及疑難排解；另以開發文件說明建置、測試、VSIX 打包及版本管理。
- Q19：專案公開發佈，採 **MIT** 授權，作者為 **Lawrence Shen**；交付規劃以公開專案與公開 Marketplace 擴充功能為目標。

## 專案識別、授權與文件

- 專案／Extension 名稱：SBOM Pilot。
- 識別名稱：`sbom-pilot`。Marketplace Publisher ID 是另一個帳號識別，不得由專案名稱或作者名稱直接推定；公開發佈前須填入實際可用的 Publisher ID 及公開專案網址。
- Task 顯示名稱：SBOM Pilot — Generate & Upload SBOM。
- 作者：Lawrence Shen。
- 授權：MIT；產品實作須包含完整授權文字、作者署名，並使套件、Extension metadata 與公開說明一致。
- README：以正體中文為主，對象為安裝擴充功能及設定 Pipeline 的使用者；提供功能、支援矩陣、前置條件、安裝流程、Classic Build／YAML 快速開始、參數與預設、私有來源認證、成品下載、DT 上傳語意及疑難排解。
- 開發文件：供維護者重現建置、執行測試、打包 VSIX、管理版本及準備公開發佈。範例使用中性專案名稱與佔位值。
- 文件隨垂直功能工單同步交付：第一張即包含正確命名、MIT 授權與最小可用 README；每張功能工單更新對應說明，最後一張完成整合驗收及公開發佈資料。

## 功能與參數契約

交付名為 SBOM Pilot 的公開 Azure Pipelines Extension，使用者加入單一 Task，即可完成工具準備、依賴安裝、SBOM 產生、選擇性的 DT 上傳及成品發佈。交付物包含可安裝的 VSIX、MIT 授權、使用者 README、維護者開發文件、Classic Build／YAML 使用範例、參數說明、相容性矩陣、驗證紀錄及公開發佈資料。

| 欄位 | 必填／顯示條件 | 預設與行為 |
| --- | --- | --- |
| 開發環境 | 必填，下拉選單 | .NET Framework、.NET Core、Vue、.NET Core 前後端合併；類型設計保留擴充空間 |
| Node.js 版本 | 必填，一律顯示 | `24.x`；取得最新符合範圍的版本，並記錄實際版本 |
| 專案路徑 | 必填，一律顯示 | 供掃描的專案根目錄；合併模式為同時包含前後端的共同根目錄，可使用 `$(Build.SourcesDirectory)` |
| 排除規則 | 選填，一律顯示 | 同一欄位接受逗號分隔的 glob；預填下列共通排除規則；保留花括號內的逗號 |
| CycloneDX Spec Version | 必填，一律顯示 | `1.6`；需以所選 cdxgen 與 DT 的相容版本驗證 |
| 推送到 DT | 明確的布林開關 | 關閉時仍產生並發佈 SBOM；只有開啟才上傳 |
| DT API URL | 啟用 DT 時必填 | `http://localhost:8081`，遵循原始需求；說明 localhost 指執行 Task 的 Agent |
| DT Project UUID | 啟用 DT 時必填 | 無預設；使用既有 DT 專案，不自動建立或改用其他專案 |
| DT API Key | 啟用 DT 時必填 | 無預設；以 Secret Pipeline Variable 傳入並遮罩 |
| 略過 DT TLS 憑證檢查 | 啟用 DT 時顯示的進階選項 | 關閉 |
| cdxgen 版本 | 進階選項 | 使用 Task 維護並驗證的固定版本；允許明確覆寫，需檢查 Node 與 CLI 相容性 |
| 補充授權資訊 | 進階選項 | 開啟，對應 `FETCH_LICENSE=true` |
| 停用 cdxgen 快取 | 進階選項 | 開啟，對應 `CDXGEN_NO_CACHE=true`；不代表停用 npm／NuGet 或 Agent 工具快取 |
| 套件來源認證 | 選填進階設定 | 沿用來源設定，認證由 Secret Pipeline Variables 傳入；具體欄位格式須在實作介面說明中明列 |

共通排除規則：

```text
**/_Design{,Front}/**,**/bin/**,**/obj/**,**/node_modules/**,**/dist/**
```

使用者可修改整份排除規則；`Csalu.Server.Test/**`、`Doc/**`、`SqlScript/**` 等專案特有路徑不作為所有 Repo 的預設。

`--required-only` 固定啟用。產出路徑、成品暫存目錄、cdxgen 的安裝位置及避免重複安裝的旗標屬 Task 內部管理，不要求使用者輸入。

## 執行流程

1. 讀取與驗證參數、專案路徑、開發環境及 Agent 平台；DT 關閉時不驗證 DT 必填欄位。
2. 在 Agent 的工具／暫存空間準備指定 Node、固定 cdxgen 與必要的一般工具；不以全域安裝狀態作為版本正確的依據。Task handler 使用的 runtime 與掃描工具使用的 Node 分別管理。
3. 依專案宣告與檔案辨識 npm／pnpm／Yarn、workspace 及 .NET 專案格式，處理來源認證與依賴還原。Task 可分階段自行執行 restore／install，再關閉 cdxgen 的自動安裝。
4. 以指定根目錄及排除規則產生 CycloneDX JSON。合併模式遵循下節的單次遞迴掃描基準。
5. 驗證輸出為可解析、符合指定 CycloneDX 版本的 SBOM，記錄組件數；不能僅憑檔案存在就宣稱產生成功。
6. 若啟用 DT，上傳相同檔案至指定 Project UUID；以 API 接受上傳為完成邊界。
7. 發佈有效 SBOM 為名稱 `SBOM` 的 Build Artifact。DT 上傳失敗時仍執行此步驟，再回報 Task 失敗。

工具準備、還原、掃描、上傳及成品發佈的失敗，應標示發生階段並回報失敗。網路操作須有界限的逾時與重試；上傳成功後不等待背景弱點分析。對於產生前的失敗，沒有有效 SBOM 可發佈時應如實記錄。

## 依賴準備與認證約束

- npm／pnpm／Yarn 的專案依賴遵循 Q10，不在掃描時建立或更新缺失／不一致的 lockfile。還原時可以需要開發套件；最終 SBOM 的範圍仍由 `--required-only` 篩選。
- 優先遵循 `packageManager` 等專案版本宣告；只有 lockfile 時，辨識管理器種類並採 Task 維護的固定相容版本。不得宣稱能從 lockfile 還原出原作者使用的精確工具版本。多套互相衝突的宣告或 lockfile 應報錯。
- .NET 還原按 SDK-style／傳統格式、PackageReference／packages.config 分流；不能要求所有 .NET 專案新增 `packages.lock.json`。已有 NuGet lockfile 時遵循其鎖定資訊。
- 一般 .NET SDK／NuGet 工具由 Task 準備；傳統 Visual Studio Build Tools／MSBuild／workloads 依 Q6 由 Agent 提供。遵循既有 SDK 版本宣告，無法判斷或缺少傳統工具時指出具體原因。
- 保留 Repo 的套件來源與安裝設定，遵循所選管理器版本對安裝腳本的規則；不自行強制略過所有安裝腳本。
- 私有來源認證由 Task 自行提供給子程序；不假定 Secret Pipeline Variables 自動成為環境變數，也不假定每個版本的 pnpm 都支援 repo `.npmrc` 的相同變數展開方式。需要暫存認證時使用 Task 暫存區並在結束時清除。
- 日誌及錯誤輸出不得洩漏 API Key、套件來源 token 或密碼；不得將認證寫回 Repo 設定或發佈到 SBOM 成品。
- 工具及套件來源需要可用的下載／還原來源；既有快取可加速流程，未承諾首次執行可完全離線。Proxy、內部 registry／feed 設定應遵循 Agent 與 Repo 的既有設定。

## 合併專案的原始範例基準

- 以 `$(Build.SourcesDirectory)` 作為同時包含前後端的共同根目錄，在該處執行 pnpm workspace 安裝與列舉。
- 以一次 `cdxgen . -r -t dotnet -t js` 遞迴掃描前後端，產生同一個輸出檔；不是先產生兩份 SBOM 再自行合併。
- 範例先執行 `pnpm install --frozen-lockfile`，cdxgen 使用 `--install-deps false`；在單一 Task 裡可分階段自行準備依賴及掃描，不代表必須讓 cdxgen 執行安裝。
- 範例排除規則為共同根目錄下的一組 glob，涵蓋 `**/_Design{,Front}/**`、`**/bin/**`、`**/obj/**`、`**/node_modules/**`、`**/dist/**`、`Csalu.Server.Test/**`、`Doc/**`、`SqlScript/**`。專案特有名稱僅為範例，尚未定義為通用預設。
- 產生檔案後，以獨立 HTTP PUT 將同一份 SBOM 上傳至單一 DT Project UUID。
- 原始文字提及的兩組排除需求已於 Q9 收斂為同一個欄位，以包含前後端相對路徑的 glob 表達。

## 實作驗證門檻

以下是實作時必須完成的查證與驗證，不代表已通過測試或已取得這些環境的相容性保證：

- 建立 Services／Server、Classic Build／YAML、Windows／Linux 的支援矩陣，填入實際 Server 更新版、Agent、Task handler、工具版本及測試結果。最低 Server 版本需以官方允許的 Server／Agent 配對及實測確定，不能從單一 Node 或 Agent 版本推算。macOS 未列入目前已確認的支援目標。
- `.NET Framework` 模式使用 Windows；其他模式依已確認可用的工具組合測試 Windows／Linux。跨平台支援目標不等於每種專案都能在所有 OS 執行。
- 選定並鎖住初版工具版本，實際驗證 `--required-only`、Spec 1.6、排除規則及 dotnet／js 合併掃描。2026-11-02 查證的上游穩定版候選為 `@cdxgen/cdxgen@13.6.0`，要求 Node >=24；此為上游宣告，尚非本專案已驗證版本。
- 驗證 npm、pnpm、Yarn 的代表性版本與 workspace、NuGet 各格式、套件來源認證，並在實作介面文件明列支援的認證欄位及固定 fallback 工具版本。
- 為 Build Artifact 選用同時支援 Server／Services 的發佈機制。本規格的 Classic 成品流程對應原始需求中的 Classic Build；Classic release 的原生成品上傳限制須如實記載於使用說明，不得直接宣稱同樣支援。

## 驗收條件

1. 一個已安裝的 Task 可由 Classic Build 介面及 YAML 使用；開發環境下拉選單包含四種類型，條件欄位符合參數表。
2. 一般工具尚未預裝、但具備必要 Agent runtime 與下載來源的環境，可由單一 Task 準備工具及依賴，不要求額外安裝或認證 Task；傳統工具鏈遵循 Q6。
3. npm、pnpm、Yarn 各至少一個有效範例能還原並產生 SBOM；缺少 lockfile、manifest 不一致、管理器資訊矛盾時能清楚失敗。合法的傳統 .NET 專案不會因缺少 npm 或 NuGet 的選用 lockfile 被誤拒。
4. .NET Framework、.NET Core、Vue 及合併專案各有代表性輸入；合併範例以單次遞迴掃描在同一份 SBOM 中產生前後端組件與可取得的依賴關係。
5. 以固定 cdxgen 版本驗證 required scope 篩選及排除規則；`**/_Design{,Front}/**` 不會因逗號分隔被破壞。不能將工具的 scope 篩選結果宣稱為已對實際部署成品完成逐項核對。
6. 關閉 DT 時仍成功產生及發佈 SBOM，且不要求 API URL、Project UUID 或 API Key。啟用時正確驗證三項必填設定。
7. DT 接受上傳後即可完成，不等待背景匯入或弱點分析；連線、認證或 HTTP 失敗時 Task 失敗，有效 SBOM 仍可從成品下載。
8. DT TLS 預設驗證、進階略過選項有效；授權補充與 cdxgen 快取開關按參數設定生效。
9. 成品中的 SBOM 與上傳檔案一致；輸出路徑不需使用者設定，成品發佈失敗不得宣稱整個 Task 成功。
10. 驗證成功及失敗日誌皆無密鑰或來源認證外洩；認證暫存資料不進入 Repo 或成品。
11. VSIX 可在支援矩陣中的環境安裝，文件提供 Classic Build 操作步驟、YAML 範例、所有欄位預設、前置條件及限制。
12. 公開專案、VSIX 與套件 metadata 使用已確認的專案／Task 名稱、MIT 授權及 Lawrence Shen 作者資訊；Publisher ID 與專案網址以實際資料填寫，不含捏造的帳號或連結。
13. README 以正體中文為主，使用者可依其完成安裝與一次完整執行；維護者可依開發文件重現建置、測試、打包及發佈準備。各功能完成時文件同步更新。

## 參考資料

- [原始需求與 PowerShell 範例](../../需求.md)。
- 本機 `D:\Project\Git\AI-PR-AutoReview` 的 `src/task.json`、`vss-extension.json`、`package.json`、`README-Dev.md`：參考 Task 欄位與 VSIX 打包慣例，不作相容性保證。
- [Marketplace：Dependency Track（eshaar-me）](https://marketplace.visualstudio.com/items?itemName=eshaar-me.vss-dependency-track-integration)、[Marketplace：Dependency Track（BlackKite）](https://marketplace.visualstudio.com/items?itemName=BlackKite.dependency-track-vsts)：參考上傳及設定介面；自動建立專案、弱點門檻等不屬於本次已確認功能。
- [cdxgen v13.6.0](https://github.com/cdxgen/cdxgen/releases/tag/v13.6.0)、[固定 tag 的套件與 Node 要求](https://github.com/cdxgen/cdxgen/blob/v13.6.0/package.json)、[固定 tag CLI](https://github.com/cdxgen/cdxgen/blob/v13.6.0/docs/CLI.md)。
- [NuGet 還原](https://learn.microsoft.com/en-us/nuget/consume-packages/package-restore)、[NuGet 鎖定資訊](https://learn.microsoft.com/en-us/nuget/consume-packages/package-references-in-project-files#locking-dependencies)。
- [Secret Pipeline Variables](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/variables?view=azure-devops#secret-variables)、[pnpm 10.x 的環境變數規則](https://pnpm.io/10.x/npmrc#environment-variables)。
- [官方 Server／Agent 支援配對說明](https://learn.microsoft.com/en-us/azure/devops/pipelines/agents/v4-agent?view=azure-devops#does-azure-devops-server-support-the-4x-agent)。

## 已查證的設計限制

- 合併範例的 `**/_Design{,Front}/**` 是一個完整 glob；逗號分隔的使用者輸入必須保留花括號內的逗號，不能直接以所有逗號切割。[glob 語法](https://github.com/isaacs/node-glob#glob-primer)
- 為支援 Server 與 Services，成品發佈可採 Build Artifact；Pipeline Artifact 不適用 Azure DevOps Server。自訂 Task 可透過 Agent 的 `artifact.upload` logging command 發佈檔案；Classic release 不支援此發佈方式，目前已確認的成品需求以 build／YAML 情境為基準。[Microsoft 成品上傳文件](https://learn.microsoft.com/en-us/azure/devops/pipelines/scripts/logging-commands?view=azure-devops#upload-upload-an-artifact)
- DT 上傳 API 接受請求並回傳 token，不代表非同步匯入已完成；token 查詢的 `processing: false` 也不能單獨證明成功匯入。Task 採 Q12 的接受上傳邊界。[DT 官方 API 原始碼](https://github.com/DependencyTrack/dependency-track/blob/master/src/main/java/org/dependencytrack/resources/v1/BomResource.java)

## Comments

- 2026-11-03 追加實作要求：README.md 與 README-Dev.md 須改為人類易讀的導讀文件；README-Dev 加入實際執行流程的 Mermaid 圖。src 下 TypeScript 須補中文函式用途說明，統一換行／排版，並拆解複雜邏輯。詳見 [工單 13](issues/13-documentation-and-source-readability.md)；保留原需求與執行行為，於最終審查前完成。
- 2026-11-02：第一輪回覆為 Q1「需要可以支援全部」、Q2「A」、Q3「希望這個能完成，不要相依外部」、Q4「看不懂，請進一步說明」、Q5「同意」。其中 Q1 與 Q3 的細部邊界保留為待確認，避免將廣泛目標當作相容性或完全離線能力的保證。
- 2026-11-02：第二輪確認 Q4 採 `--required-only`、Q6 採 A；Q7 要求重新閱讀原始合併專案範例；Q8 接受工具與作業系統的支援邊界。已補記共同根目錄一次遞迴掃描的基準，修正上一輪偏向兩個獨立掃描路徑的建議。
- 2026-11-02：使用者同意 Q9～Q12 的建議，已確認共用排除欄位、前端嚴格 lockfile 政策、預設驗證 DT TLS，以及以 API 接受上傳作為成功邊界。
- 2026-11-02：使用者「全部同意」Q13～Q16，確認固定 cdxgen 版本政策、npm／pnpm／Yarn 支援、Task 內認證與其餘預設。已彙整參數、流程與驗收條件，等待整份規格的最終共同理解確認；未開始產品實作。
- 2026-11-02：to-tickets 拆分討論中補問品牌與文件；使用者同意 Q17、Q18，並指定 Q19 為公開專案、MIT 授權、作者 Lawrence Shen。已補入規格；12 張工單草案的 01 增加正式命名、MIT 與初版 README，12 增加公開發佈準備，其餘工單同步維護文件。工單拆分仍待確認後逐張建立。
