# tool-track

- 驅動：chrome-devtools-mcp 1.2.0，Chrome/156.0.0.0（pipe，無 port）
- T1 MCP 自己開的 headed 視窗預設 viewport 約 485px 寬，不是 1280；前段測試在這個寬度做，`resize_page 1280x800` 後才是桌機。摩擦，不是 bug
- T2 `emulate` 設 `isMobile` 後頁面重新載入，`scripts/mask.js` 不見，下一個 `evaluate_script` 報 `__frontendQaMaskResult is not a function`；重裝後成功。SKILL.md 只寫 `navigate_page` 之後重裝，`emulate`（mobile）也要
- T3 `emulate` 的 `networkConditions` 沒有「關閉」選項（只接受 Offline/Slow 3G/Fast 3G/Slow 4G/Fast 4G）；要用只帶 `viewport` 的 `emulate` 呼叫才會清掉節流。SKILL.md 沒寫怎麼還原
- T4 Slow 3G 重新載入後我直接跑了一個未經 `__frontendQaMaskResult` 的 `evaluate_script`（只回列數與文字，無敏感值）。違反「每個回傳都過 mask」的規則一次，記在這裡
- T5 還原 checkpoint 後 `navigate_page` 到同一個 origin 的 hash 網址（`/#/orders`）只換 hash、不重新載入，app 記憶體裡的狀態（例如篩選「已完成」）還在；第二次重現時 snapshot 一開始就是「已完成」pressed。SKILL.md 說還原後 `navigate_page` 打開存下來的網址，沒有說 hash 路由要強制重新載入
