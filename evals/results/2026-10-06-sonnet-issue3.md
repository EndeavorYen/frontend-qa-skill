# 2026-10-06 sonnet-issue3

驗證 #3：每打開一筆抽樣資料就檢查 console，畫面異常要先查 console 和 netlog。

- skill：`frontend-qa` @ 4a1d22f（PR #14）；深度 4，開啟全部面項
- 執行：同 [sonnet-baseline](2026-10-06-sonnet-baseline.md)（`claude-sonnet-5-5`、effort high、全新的空目錄、`:4174` / `:9445`）
- 成本：120 turns、21.6 分鐘、US$4.23（基準：102 turns、20.9 分鐘、US$3.42）
- 產出：[report](2026-10-06-sonnet-issue3-artifacts/report.md)、[findings](2026-10-06-sonnet-issue3-artifacts/findings.md)、[ux-review](2026-10-06-sonnet-issue3-artifacts/ux-review.md)、[coverage](2026-10-06-sonnet-issue3-artifacts/coverage.md)、[tool-track](2026-10-06-sonnet-issue3-artifacts/tool-track.md)
- 稽核：讀取原始碼 0 次；`gh issue create/comment` 0 次

| # | 抓到 | 對應 F 編號 | 等級差距 | 備註 |
|---|---|---|---|---|
| B1 | ✅ | F12 | 1（報 P1） | |
| B2 | ✅ | F32 | 0 | |
| B3 | ✅ | F35 | 1（報 P2） | |
| B4 | ✅ | F18 | 0 | |
| B5 | ✅ | F4 | 0 | |
| B6 | ✅ | F10 | 0 | |
| B7 | ✅ | F6 | 0 | |
| B8 | ✅ | F7 | 0 | |
| B9 | ✅ | F25 | 0 | |
| B10 | ✅ | F24 | 1（報 P2） | |
| B11 | ✅ | F15 | 0 | |
| B12 | ✅ | F1 | 0 | 打開 #3 後立刻讀 console，把備註空白和 `TypeError ... reading 'trim'` 寫成同一筆，報 P2；抽樣表的 console 欄也有記錄 |
| B13 | ✅ | F20 | 1（報 P3） | |
| B14 | ✅ | F17 | 0 | |
| B15 | ✅ | F5 | 0 | |
| B16 | ✅ | F13 | 0 | |
| B17 | ✅ | F8 | 1（報 P3） | |
| B18 | ✅ | F19 | 0 | |
| B19 | ✅ | F2 | 0 | |
| B20 | ✅ | F38 | 1（報 P2） | |
| B21 | ✅ | F3 | 0 | |

## 指標

- 總抓到率：21 / 21 = **100%**（基準：20.5）
- P0+P1 抓到率：5 / 5 = **100%**
- 等級差距：0 級 15 個、1 級 6 個（基準：12 / 9）
- 體檢命中率：7 / 7；低於下限數：0 / 9

## #3 的完成條件

- B12 拿到完整的 1 分，而且報 P2：**達成**
- 其他 B 的抓到率不低於基準：**達成**（B1–B11、B13–B21 全部抓到）

成本比基準多 24%，可能來自逐筆清空和讀取 console。只有一次評測。
