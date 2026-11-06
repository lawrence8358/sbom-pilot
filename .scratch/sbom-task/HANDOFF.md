# SBOM Pilot 續接入口

本機開發、文件、Marketplace 準備與獨立審查已完成。沒有待派工的實作或執行中的測試；外部 Azure 驗收與正式發布身分仍未提供。

## 恢復事實

先執行 node scripts/resume.mjs，核對 Git 與 implementation-state.json。整合分支為 feature/sbom-pilot，沒有遠端，不 push、不建立 PR。若使用者有新需求，再建立追加工單；不要把舊 checkpoint 中的歷史進行中狀態當成現在的工作。

## 最後完成內容

- 01–14：Task 核心、四模式、認證／工具／驗證、README／Dev Mermaid、中文函式用途及重構；審查見 [原總表](reviews/report.md)。
- 15：函式／責任區塊空白、JavaScript／TypeScript 通用前端與 legacy vue、實際 exe／argv／cwd 及原生 HTTP 診斷。秘密遮罩與 Agent logging command 跳脫已修正；見 [15總表](reviews/15-report.md)。
- 16：五個 packaging 指令、preview/private/public、一次性 PNG、overview／上架文件、來源／dist／VSIX 及交付雜湊檢查。清單共用及 Bash 設定修正候選 b231a69，獨立 merge f70fe2b；兩軸未解決0，見 [16總表](reviews/16-report.md)。
- 使用者要求最多一位子代理；所有實作、整合與審查皆序列執行。額度中斷從原 checkpoint 接續，沒有重做舊矩陣。

## 目前可用產物

- **最新上架用正式包（2026-11-06）**：packages/public/LawrenceShen.sbom-pilot-0.1.0.vsix；Publisher LawrenceShen、public:true、Repo https://github.com/lawrence8358/sbom-pilot，已核對實際archive。
- 正式交付資料：packages/submission/public/LawrenceShen.sbom-pilot-0.1.0-HUW3Lx；109檔SHA全部通過。VSIX 3789838bytes，SHA256 b9f50a595e168ee7582b9432b4f076e10090821f23a294efc0e435f29df0a4f3；runtime仍c937...，Node20/24四組dist/VSIX probes通過。見 [正式包紀錄](reviews/publisher-release.md)。
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
