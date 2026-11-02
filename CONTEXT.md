# SBOM Pilot

本領域描述交付產品的軟體組成清單，以及它與 Dependency-Track 專案的對應關係。

## Language

**交付產品**：
作為同一個整體交付、以一份 SBOM 描述軟體組成的產品。合併專案中的前端與後端共同構成一個交付產品。
_Avoid_: Repo（版本庫是原始碼的存放邊界，並非產品的同義詞）

**SBOM**：
描述交付產品的軟體組件與依賴關係的清單。
_Avoid_: 弱點報告（弱點分析結果並非軟體組成清單）

**DT 專案**：
Dependency-Track 中以 Project UUID 識別、接收交付產品 SBOM 的專案紀錄。
_Avoid_: 掃描路徑（掃描路徑是原始碼位置，並非 DT 專案）

**.NET Core 專案**：
原始需求中用來稱呼 .NET Core 後端交付產品的專案分類，與 .NET Framework 分類區分。
_Avoid_: 現代 .NET
