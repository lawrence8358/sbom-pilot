# 工單工作區清理結果

清理前逐一核對01–14：絕對路徑皆位於 `D:/Project/Git/.sbom-pilot-worktrees`，根目錄與各工作區不是連結；branch正確、Git status乾淨、HEAD皆為整合分支祖先。必要的去秘密證據先複製至root `.smoke/review-14/`。原生Git清理未使用force，未刪分支或提交。

`git worktree list`最後只列 `D:/Project/Git/sbom-pilot`／`feature/sbom-pilot`，14個工單註冊均已移除。

| 結果 | 工單 |
| --- | --- |
| 原生Git成功刪除目錄，exit0 | 01、02、04、06、08、10、11、12、14 |
| 原生Git解除註冊但刪檔失敗，exit255；目錄保留 | 03-pnpm、05-dotnet、07-combined、09-npm-auth、13-readability |

對03殘留再次核對絕對範圍、原clean/merged證據及HEAD已整合後，嘗試PowerShell刪除該精確目錄。**自動核准審查拒絕該動作，理由僅「blocked by policy」**，命令沒有執行。不繞過拒絕；03保留，另外四個同類殘留也不再嘗試直接刪除。不能宣稱這五個檔案目錄已完全清理，也不能宣稱後四個各自接受過自動審查。

精確每項原生命令exit／錯誤與preflight保留於root忽略目錄 `.smoke/worktree-cleanup/results.json`／`preflight.json`；最後核對五個保留目錄都沒有 `.git`，14條ticket分支與提交歷史仍保留。這些是清理殘留，不是未提交WIP或未完成程式工單。

舊可選診斷暫存 `C:/Users/lawrence/AppData/Local/Temp/sbom-final-GP4o3T` 另有早前同理由的刪除拒絕，本次未觸碰。Docker測試證據與無關資源保持原狀。

清理後產品樹仍與固定驗證產品 `917afff` 一致；root VSIX仍443939bytes／SHA-256 `110e443bcc9cfb8e3fa0f974d05939b18db3fc736033f9660df1cbb88eb91e26`。本機開發與審查完成；不把檔案清理限制當作產品驗證通過或失敗。
