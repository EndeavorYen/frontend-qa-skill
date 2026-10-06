# 2026-10-06 sonnet-baseline

之後的 skill 改動都用 Sonnet 跑評測，所以先在 main 上用同一個模型跑一次基準，避免拿 Sonnet 的結果直接和 v2（Opus）比較。

- skill：`frontend-qa` @ dfede0f（main，內容和 skill-v2 相同，只多了答案卷的下限）；深度 4，開啟全部面項
- 執行：`claude -p --model claude-sonnet-5-5 --effort high`，headless，工作目錄是全新的空目錄；app 在 `:4174`，headless Chromium 在 `:9445`；提示詞見 [prompt](2026-10-06-sonnet-baseline-artifacts/prompt.txt)
- 成本：102 turns、20.9 分鐘、US$3.42（v2 用 Opus：165 turns、25.5 分鐘、US$7.93）
- 產出：[report](2026-10-06-sonnet-baseline-artifacts/report.md)、[findings](2026-10-06-sonnet-baseline-artifacts/findings.md)、[ux-review](2026-10-06-sonnet-baseline-artifacts/ux-review.md)、[coverage](2026-10-06-sonnet-baseline-artifacts/coverage.md)、[tool-track](2026-10-06-sonnet-baseline-artifacts/tool-track.md)
- 稽核：讀取原始碼 0 次；`gh issue create/comment` 0 次

| # | 抓到 | 對應 F 編號 | 等級差距 | 備註 |
|---|---|---|---|---|
| B1 | ✅ | F11 | 1（報 P1） | |
| B2 | ✅ | F23 | 0 | |
| B3 | ✅ | F18 | 0 | |
| B4 | ✅ | F5 | 0 | |
| B5 | ✅ | F10 | 0 | |
| B6 | ✅ | F14 | 0 | |
| B7 | ✅ | F6 | 0 | |
| B8 | ✅ | F7 | 0 | |
| B9 | ✅ | F28 | 0 | |
| B10 | ✅ | F27 | 1（報 P2） | |
| B11 | ✅ | F24 | 0 | |
| B12 | ½ | F32 | 1（報 P3） | 發現 #3 備註空白，但沒有連到 console 的 TypeError，和 v2 一樣 |
| B13 | ✅ | F17 | 1（報 P3） | |
| B14 | ✅ | F4 | 1（報 P1） | |
| B15 | ✅ | F31 | 0 | |
| B16 | ✅ | F9 | 1（報 P1） | |
| B17 | ✅ | F33 | 1（報 P3） | |
| B18 | ✅ | F35 | 0 | |
| B19 | ✅ | F1 | 1（報 P1） | |
| B20 | ✅ | F21 | 1（報 P2） | |
| B21 | ✅ | F2 | 0 | |

## 指標

- 總抓到率：20.5 / 21 = **98%**（v2 用 Opus：98%）
- P0+P1 抓到率：5 / 5 = **100%**
- 等級差距：0 級 12 個、1 級 9 個
- 假陽性：沒有逐條重現確認，從報告內容看沒有明顯不成立的項目
- 體檢命中率：7 / 7；低於下限數：0 / 9（L1–L9 依畫面名稱對照：S1 是 4/4/4，其餘都是 3）

成本降到 v2 的 43%，抓到率相同。只有一次評測，模型之間的差異還需要更多次評測確認。
