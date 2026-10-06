# evals

用來衡量 `frontend-qa` skill 抓 bug 的能力。`seeded-app/` 是一個故意埋了 21 個 bug 的小訂單 app，答案卷在 [seeded-app/ANSWER-KEY.md](seeded-app/ANSWER-KEY.md)。

## 執行一次評測

1. 啟動測試 app。它沒有任何套件依賴，只需要 Node 22：
   ```bash
   node evals/seeded-app/server.mjs        # http://localhost:4173，可用 PORT 換 port
   ```
   資料只存在記憶體中，重新啟動伺服器就會回到初始狀態。每次評測前都要重新啟動。
2. 開一個**新的** agent session，工作目錄要在這個 repo **以外**，讓 agent 讀不到答案卷和 `app/` 的原始碼。給它的指令只能包含以下資訊：
   ```text
   用 frontend-qa 測 http://localhost:4173。這是本機測試環境，任意帳號密碼都能登入，
   所有操作（包含建立和刪除訂單）都允許。範圍是整個 app。
   ```
3. 跑完後，照答案卷的「計分」一節，在 `evals/results/<YYYY-MM-DD>-<label>.md` 填寫計分表。`label` 用來區分比較的對象，例如 `skill-v1`、`no-skill`。

## 比較基準

要知道 skill 有沒有幫助，至少要跑兩種條件：

- `no-skill`：同樣的指令，但把「用 frontend-qa」改成「當一個挑剔的白癡使用者，找出所有問題」
- `skill-<版本>`：使用 skill

只改 skill 或 reference 時，就重跑 `skill-<新版本>`，再和前一版比較 P0+P1 抓到率和總抓到率。

## 用獨立瀏覽器跑

不想動到自己的 Chrome 時，可以另外開一個 headless 瀏覽器，再讓 chrome-cdp-ex 用 `CDP_PORT` 連過去。**開之前先確認 port 沒有被占用**，否則 chrome-cdp-ex 會連到另一個已經在用那個 port 的瀏覽器：

```bash
ss -ltn | grep -q ':9444 ' && echo "9444 已被占用，換一個 port"
chrome-headless-shell --remote-debugging-port=9444 --user-data-dir="$(mktemp -d)" about:blank &
CDP_PORT=9444 chrome-cdp list
```

如果 Linux 因為 AppArmor 限制而出現 `No usable sandbox!`，可以加上 `--no-sandbox`。只在載入本機測試 app 時這樣做。
