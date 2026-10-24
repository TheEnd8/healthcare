# Healthcare Info Hub — 投資情報工作台

## 主要頁面
- `index.html`：全球生技醫療情報總覽。
- `investment.html`：投資研究工作台，合併公司事件、監管事件與產業趨勢，支援全文搜尋、類型篩選、更新鮮度提示與規則式研究排序。
- `admin.html`：標的清單管理。

## 資料品質與測試
- `scripts/validate.mjs`：AI 事件的日期、必填欄位、來源 URL 與報導期間驗證。
- `tests/validate.test.mjs`：日期、URL、未來日期與事件欄位測試。
- GitHub Actions 在 PR 與 main push 時執行 `node --test tests/*.test.mjs`。

## 安全提醒
管理頁面的 Fine-grained token 僅在當次頁面記憶體中使用，不應儲存於 localStorage。請只授予單一 repo 的 Contents 讀寫權限，完成操作後清空 Token 欄位；若曾將 Token 存於共用或不可信裝置，請撤銷並重新建立。

## 限制
- 投資研究排序是可解釋的關鍵詞規則，不是模型評級或投資建議。
- URL 驗證只能確認 URL 格式與 HTTP(S) 協定，不能保證來源頁面仍存在、內容支持摘要或新聞已被獨立查證。
- 股價可能延遲或缺漏；重大事件應回到公司公告與官方監管來源核對。
