# SBOM Pilot 續接入口

本機開發、文件整理與最終程式碼審查已完成。先執行 `node scripts/resume.mjs`，以 Git 實況與 implementation-state 為準；精確證據見 [最終檢查點](checkpoints/final.md)。

## 已完成

- 分支 `feature/sbom-pilot`，無遠端；01–14皆已提交、整合及本機驗證。
- README改為使用者導讀；README-Dev提供開發步驟、模組分工及實際四模式Mermaid流程。
- src全體TypeScript統一Prettier／LF、中文函式用途說明；170/170具名函式／callable檢查通過。按責任拆解管理器、認證、壓縮檔、網路、SDK／還原及流程分派。
- 工單14修正註解、共用鎖檔／assets判定、Node cache初始競爭、Windows有界rename重試及正式打包URL驗證；merge `c831001`，最終產品驗證提交 `917afff`。
- Windows/Linux、Node20/24各108項測試、型別、格式、build、實際dist/VSIX入口與受影響真實流程通過；[整合證據](reviews/14-integration.md)。
- [兩軸審查總表](reviews/report.md)：Standards初次3項、Spec初次1項均修正並獨立複查；協調追加2項也已修正。原始固定基準 `e3a5bf6ed57b74c519d0d64285f2929d0195688b` 不變。

## 最後收尾

目前程式與審查皆結案，只剩確認安全清理結果及保存最終狀態。清理前已核對14個工單worktree全部乾淨且HEAD為整合分支祖先；只清理由本次建立、已合併的worktree，保留分支與提交歷史。精確清理結果以final checkpoint／implementation-state及實際git worktree list為準，不依此段假定已刪除。舊checkpoint所列worktree可能已清理，不要因此重做完成的工單。

最終開發VSIX位於 `packages/local-dev-placeholder.sbom-pilot-0.1.0.vsix`，443939bytes；SHA-256 `110e443bcc9cfb8e3fa0f974d05939b18db3fc736033f9660df1cbb88eb91e26`。本次去秘密證據另存root忽略目錄 `.smoke/review-14/`，不會隨工單worktree清理消失。

## 仍待外部環境

實際Publisher／公開Repo尚未提供，開發包使用local-dev-placeholder。live Services／Server安裝、Classic／YAML UI、原生成品下載與Agent非同步失敗傳播、arm64及公司feed／企業Proxy/CA尚未驗收。Docker／loopback／本機adapter證據不代替Azure實測；Linux本次SDK預裝與先前冷SDK證據分開記錄。見 [相容矩陣](../../docs/compatibility.md)。

## 固定約束

- 名稱SBOM Pilot／sbom-pilot；Task為SBOM Pilot — Generate & Upload SBOM；MIT，Lawrence Shen；使用「.NET Core」。
- 同時最多一個子代理，包含實作、合併、審查；不得為續接重新啟動已完成工單或重跑無關矩陣。
- 保留秘密模組第一載入、physical sourceRoot／認證暫存、鎖檔、assets／nupkg、JSONC ESM alias、單次合併掃描、DT失敗仍交付有效成品與runtime告示。
- 舊可選診斷暫存 `C:/Users/lawrence/AppData/Local/Temp/sbom-final-GP4o3T` 刪除曾遭自動審查拒絕，理由僅「blocked by policy」；保留，不再嘗試。
- Linux測試容器與volume保留證據，不做Docker prune或不相關資源清理；研究筆記 `D:/Project/Git/.sbom-pilot-notes`。

歷史精確命令、失敗及續接記錄保留於checkpoint12／13／14與Git；代理對話或ID不作為事實來源。
