# 文章圖文正文樣式

狀態：待回歸。

依使用者要求，不在詳情頁識別患者/醫生或設置問答專用樣式；將30篇正文存為帶內聯樣式的HTML圖文，原文文字不變。

通用顯示：PC復用既有商品圖文過濾器，僅文章允許安全的排版樣式；小程序使用原生rich-text，普通純文字仍原樣顯示。不保留先前dialogue API欄位及問答專用頁面結構。

已執行驗證：
- 本地ID 4–33僅更新content為圖文HTML，標題/分類/發布者/狀態未變；更新前備份before-richtext-styling.json。
- 在瀏覽器逐篇取得30篇真實API，經通用圖文過濾器渲染後，每個p的文字與Word原始251段逐字一致，無刪減。
- 通用過濾器保留排版白名單，腳本、事件、javascript URL及position/background-image等非排版屬性移除；商品原本不保留樣式的行為不變；純文字回退通過。
- 真實PC 1440/390核對，2個圖文區塊樣式正常，無橫向溢出；截圖.codex-tmp/article-richtext-1440.png及article-richtext-390.png。
- 後台原有MdPreview直接預覽圖文HTML，患者提問與醫生答覆兩個帶樣式區塊正常，無需專用問答識別。
- 小程序實際Page處理器確認isRichText為true、原HTML不變、dialogue不存在；WXML標籤校驗通過。原生rich-text開發者工具/真機未執行。
- PC構建與git diff --check通過。本地後端已重啟，正式環境未部署或寫入，獨立回歸未執行。

圖文資料包：deliverables/community-qa-2026-10-29/articles.richtext.json；articles.pending.json正文亦已同步更新。source-verbatim.json仍保留原始純文字供逐字核對。

歷史：2026-10-29 由問答專用頁面樣式改為文章正文圖文；完成開發自測後標待回歸。
