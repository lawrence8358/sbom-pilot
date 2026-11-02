# 領域文件

說明工程類 skill 在探索程式碼時，應如何使用本 repo 的領域文件。

## 探索前先閱讀

- repo 根目錄的 **`CONTEXT.md`**，或
- repo 根目錄的 **`CONTEXT-MAP.md`**（若存在）：它會指向每個 context 各自的 `CONTEXT.md`，請閱讀與主題相關的每一份。
- **`docs/adr/`**：閱讀與你即將處理的範圍相關的 ADR。若是 multi-context repo，也要檢查 `src/<context>/docs/adr/` 中屬於該 context 的決策。

上述檔案若不存在，**直接略過即可**。不要提出它們不存在，也不要一開始就建議建立。`/domain-modeling` skill（可經由 `/grill-with-docs` 與 `/improve-codebase-architecture` 觸發）會在用語或決策真正確定時，才按需建立這些檔案。

## 檔案結構

single-context repo（大多數 repo）：

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

multi-context repo（根目錄有 `CONTEXT-MAP.md`）：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 全系統層級的決策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 該 context 專屬的決策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 使用詞彙表中的用語

當你的產出提到某個領域概念時（例如 issue 標題、重構提案、假設、測試名稱），請使用 `CONTEXT.md` 中定義的用語，不要改用詞彙表明確避免的同義詞。

如果需要的概念還不在詞彙表中，這是一個訊號：可能是你在發明專案沒有使用的用語（請重新考慮），或是真的有缺漏（記下來交給 `/domain-modeling` 處理）。

## 指出與 ADR 的衝突

如果你的產出與既有 ADR 相衝突，請明確指出，不要默默覆蓋：

> _與 ADR-0007（event-sourced orders）相衝突，但值得重新討論，因為……_
