# 未歸因

### U1 slow-3g 當下立刻看到 Failed to fetch

- 畫面：S2 訂單列表
- 試過：先 `throttle offline` 進入列表，看到 `Failed to fetch` 與「載入中…」。接著 `throttle off`，再 `throttle slow-3g` 進入列表。文字仍是「載入中…」，`status --vitals` 裡還有 `TypeError: Failed to fetch`，LCP 顯示 23184 ms
- 為什麼判斷不出來：slow-3g 那次沒有先 `console --clear`，例外可能是上一步離線留下的。沒有等到慢速請求結束就讀了畫面，所以也不能說慢速網路沒有載入提示
- 需要使用者：在清掉 console 之後單獨開 slow-3g，等列表請求結束，再看是載入完成還是真的失敗

沒有把這次 slow-3g 記成產品問題。離線與 HTTP 500 的「載入中…」是另外測的，見 F4。
