# 工單15最後複查條件

原整份規格review基準e3a5bf6不變；01–14已於d296f56完成本機開發與兩軸複查。本次新增需求依issue15及spec最新Comments，增量固定點為d296f56，最終候選SHA待實作者交回後填入。只審本次變更，不重做已關閉的歷史矩陣。

- Standards：AGENTS、README-Dev、Prettier／src LF／中文用途規則，新增函式間與責任區塊空白行；保留既有介面與嵌入腳本語意，避免機械灌空白。沿用code-review技能的Fowler smells，屬判斷建議而非硬性違規。
- Spec：使用者三項最新要求與明確點名src/task.json；通用JavaScript/TypeScript與javascript／legacy vue、npm/Yarn/pnpm Angular真實證據、實際子程序exe/argv/cwd可見且不改Command／shellfalse、秘密***與DT真實HTTP PUT可核對。
- 實作／merger／審查序列執行，最多一個子代理；先提交checkpoint再長測試，無remote／push／PR。

## 協調實作中查核

1. scan日誌欄位初版直接顯示FETCH_LICENSE／CDXGEN_NO_CACHE，可繞過已知secret遮罩；7379366已經redact並補回歸。最終複查需核對，不假定Agent後處理足夠。
2. 7379366的commandRedactor先generic header regex再替換已知值，可將含空白的已知認證切碎，後段無法完整匹配。以同一regex的純JS合成探針重現：已知值prefix middle suffix，Authorization Bearer前綴處理後仍保留middle suffix。已通知唯一worker在候選內改為已知值完整替換優先，補compound header／URL回歸；最終需要確認已修正。這些是實作中查核，與14初次兩軸報告分開。

固定比較SHA、最後檢查／實際流程／套件hash與結論，待候選交回與獨立整合後保存至15整合及兩軸報告。

固定候選：87597bf462de8f5b0232cc7ed3c12f6648ff6246（乾淨），Task runtime遮罩排序修正cc07bd3；兩項實作中查核均已加入回歸並修正。Windows/Linux Node20/24各114tests、175中文說明、間距／型別／格式／封裝、Angular三管理器與private combined／DT403真實流程通過。尚待獨立merger與兩軸增量複查；不可把候選通過當作已整合。

第一次15整合已完成：merge f1a0a5f，root驗證42b5d25；114tests／175中文說明／spacing0及Node20/24封裝全過，27份證據已在root .smoke/review-15。初次增量Standards報告15-standards.md發現P3預檢用途註解與Duplicated Code旗標名稱模式；兩項由原唯一實作者在原15worktree集中修正，再獨立整合／複查，不宣告審查結案。兩處純空白已由merger獲授權修正。
