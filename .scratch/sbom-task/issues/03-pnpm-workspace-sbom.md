# 03: pnpm 與 workspace 專案完成 SBOM 流程

Status: ready-for-agent
Blocked by: 01

**What to build:** 使用公開套件來源的 pnpm 單專案或 workspace 交付產品，可由同一 Task 自動辨識管理器、準備對應版本、依鎖定資訊安裝、掃描並發佈 SBOM。

## Acceptance criteria

- [ ] 依專案的管理器宣告與 lockfile 辨識 pnpm，並沿用共同的工具準備、掃描、格式驗證及成品發佈流程。
- [ ] 優先使用專案宣告的管理器版本；僅能辨識管理器種類時採 Task 維護的固定相容版本，記錄選擇與實際版本，不宣稱由 lockfile 還原出作者的精確工具版本。
- [ ] 以 frozen lockfile 原則安裝；缺少 lockfile、與 manifest 不一致，或管理器宣告與鎖檔互相矛盾時明確失敗，不任意改用 npm 或更新鎖檔。
- [ ] workspace 從正確共同根目錄處理，保留既有來源與安裝設定；遵循所選 pnpm 版本的安裝腳本規則，不自行強制停用所有腳本。
- [ ] 代表性 workspace 的 SBOM 可觀察到預期 workspace 套件及可取得的依賴關係；只執行 Task 所需安裝階段，不讓掃描工具再次安裝依賴。
- [ ] 有單專案、workspace、鎖檔不一致及管理器資訊衝突的必要驗證；README 說明辨識規則、版本選擇、限制與一個可執行範例。

## Comments

- 使用者已核可本工單及其阻擋關係；私有來源認證另由 09 交付。
