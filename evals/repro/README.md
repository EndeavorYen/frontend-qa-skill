# 重現腳本範例（seeded-app）

照 [`skills/frontend-qa/references/repro.md`](../../skills/frontend-qa/references/repro.md) 手寫的 5 份重現腳本，對應答案卷的 B1、B2、B3、B6、B20。用途有兩個：示範 `repro.md` 的寫法可行，以及之後評測時對照 agent 自己寫的腳本。

**跑 QA 的 agent 不可以讀這個目錄**，理由和答案卷相同。

```bash
REPO=$(pwd)                                            # 在 repo 根目錄執行
node evals/seeded-app/server.mjs &                     # http://localhost:4173
cd "$(mktemp -d)"                                      # Playwright 裝在暫存目錄，不加進 repo
npm i @playwright/test && npx playwright install chromium
export NODE_PATH="$PWD/node_modules"                   # spec 在 repo 裡，要靠 NODE_PATH 找到暫存目錄的 @playwright/test
export QA_PASSWORD=x                                   # seeded-app 收任何非空密碼，這是假值
BASE_URL=http://localhost:4173 npx playwright test -c "$REPO/evals/repro"
```

需要 `@playwright/test` 1.51 以上（`filter({ visible: true })`）。

在原版 seeded-app 上，5 份都應該因為斷言失敗。只修好其中一個 bug 時，只有對應的那一份通過。

| 檔案 | 答案卷 | 斷言（修好後應成立） |
|---|---|---|
| F1.spec.ts | B1 | 連點送出只發出 1 個 POST |
| F2.spec.ts | B2 | 手機上送出按鈕的中心點沒有被蓋住 |
| F3.spec.ts | B3 | 列表 API 回 500 時，5 秒內不再顯示「載入中」 |
| F6.spec.ts | B6 | 儲存的顯示名稱在重新整理後仍然保留 |
| F20.spec.ts | B20 | 離線送出時 5 秒內出現錯誤訊息 |
