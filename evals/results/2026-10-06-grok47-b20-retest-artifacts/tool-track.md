# 工具軌

- chrome-cdp-ex：`a690a07`（https://github.com/EndeavorYen/chrome-cdp-ex）
- Chrome：148.0.7778.96（HeadlessChrome/148.0.0.0）
- OS / Node：Linux，Node v22.14.0

### T1 [bug] `nav` 在 readyState 已是 complete 時仍逾時

- 指令：`nav <t> http://127.0.0.1:4173/`
- 預期：導覽完成就回成功
- 實際：`Error: Timed out waiting for navigation to finish (last readyState: complete …/#/login)`，`Kind: timeout`。接著 `perceive` 可以正常讀到登入頁
- 替代方法：忽略這次逾時，直接 `perceive`
- 重現條件：第一次打開這個本機 hash 路由
- 影響：沒有把覆蓋格標成 ⛔。測試繼續
- 既有：類似已關閉的 chrome-cdp-ex #144（nav times out waiting for Page.navigate）、#402（timeout while the action actually ran）

### T2 [bug] 用可見文字點擊時，會改走 JS click，蓋住的按鈕也回成功

- 指令：`click <t> 送出訂單`（390×844，按鈕中心被頁尾蓋住）
- 預期：回報被蓋住（`Kind: covered`），不要當成點到按鈕
- 實際：回報 `JS-clicked <BUTTON> "送出訂單"`，exit 0。同一時刻 `elementFromPoint` 是 `FOOTER`
- 替代方法：用 `elementFromPoint` 判斷真正接到點擊的元素
- 重現條件：目標的中心落在 `position: fixed` 的頁尾上，而且指令用的是可見文字
- 影響：若只看 click 回執，會漏掉 F3。這次改用 hit-test 仍記入產品軌
- 既有：已關閉的 #436（click reports Clicked when another element covers the click point）。這次的差異是回執寫 JS-clicked

### T3 [摩擦] `styles` 找不到元素時，Kind 是 unknown

- 指令：`styles <t> button.btn-primary`（當下頁面還沒有這個按鈕）
- 預期：`Kind: selector`，並建議改 selector
- 實際：`Kind: unknown`，訊息是 raw cause
- 替代方法：`eval` 讀 `getComputedStyle`
- 既有：已關閉的 #527（unclassified failure）

### T4 [摩擦] `mock add` 預設 content-type 是 text/plain

- 情境：要讓 JSON API 回 500 或 `[]`
- 目前做法：必須自己加 `--content-type application/json`，否則 body 不會以 JSON 送出，列表的失敗模式和真正的 500 不一樣
- 建議：`--body` 以 `{` 開頭時預設 `application/json`，或在回執裡寫出 content-type 已被設成 text/plain
- 頻率：這次一開始誤用一次，改對之後才重測 F4

## Issue 草稿

這次評測不發工具 issue。下面只留草稿，狀態都是未發出。

### 草稿 A — 不新開，可併入 #436

**標題**：`click`: visible-text click JS-clicks a control whose center is covered

## 環境
- chrome-cdp-ex: a690a07
- Chrome: 148.0.7778.96
- OS / Node: Linux / v22.14.0

## 重現
1. 開一個按鈕，中心被 `position: fixed` 的頁尾蓋住
2. `click <t> <按鈕可見文字>`
3. `elementFromPoint` 讀按鈕中心

## 預期
回報 `Kind: covered`，不要把 JS click 當成使用者點到了按鈕

## 實際
回報 `JS-clicked`，exit 0。hit-test 落在頁尾

## 替代方法
用座標 hit-test 確認最上層元素

## 背景
這是在使用 chrome-cdp-ex 進行前端品質驗證時發現的。與已關閉的 #436 相近。

### 草稿 B — 不新開，可併入 #144

**標題**：`nav`: times out after readyState complete on a hash route

狀態：未發出。評測協議不對工具 repo 發 issue。
