# chrome-cdp-ex issue 草稿（已在 2bd2728 重測）

來源：skill-v1 的 A–E、skill-v2 的 D1–D6 和 C1。所有草稿都已經在 `2bd2728`（origin/main，2026-10-06）上，用最小 HTML 重新測過。

## 處置總表

| # | 來源 | 結果 |
|---|---|---|
| 1 | v1-A、v2-D1、v2-D3 | **仍然重現**：三份合併成一份 |
| 2 | v1-B、v2-D2 | **仍然重現** |
| 3 | v2-D4 | **仍然重現** |
| 4 | v1-D | **仍然重現**（proposal） |
| 5 | v2-D5 前半 | **仍然重現**（proposal） |
| — | v1-C、v2-T3（click 回報 `no-change`） | 新版的 click 回報已經不再宣稱 `Outcome`，不開 |
| — | v1-E（`netlog --all`） | usage 錯誤已經會列出可用的旗標，剩下的別名需求太小，不開 |
| — | v2-D3 單獨（`netlog` 漏記） | daemon 沒有重啟時，3 次 fetch 都有記到；已經併入 #1 |
| — | v1 T1–T3、v2 T1（daemon 中斷） | #549 已經修正，不開 |
| — | v2-D5 後半、v2-D6、v2-C1 | 這次沒有重測，先不開 |

---

## 1. Tab daemon restart silently resets dialog, throttle, mock and netlog state

**Environment:** chrome-cdp-ex 2bd2728 (2.20.0), HeadlessChrome 153.0.8010.12, Linux 6.8, Node 22.22.3

**Repro**
1. Page: `<button onclick="document.title=confirm('delete?')?'accepted':'dismissed'">confirm</button>`
2. `cdp throttle <t> offline` and `cdp dialog <t> dismiss`
3. End the tab daemon abnormally, for example `kill -9` on the `cdp.mjs _daemon <target>` process. This simulates a crash or idle exit.
4. `cdp eval <t> "1+1"` works and prints no warning.
5. `cdp throttle <t>` prints `Network throttle: off`; `cdp dialog <t>` prints `Auto-accept: ON`.
6. `cdp click <t> <confirm button>` prints `Dialog: confirm "delete?" → accepted`.

**Expected:** The new daemon re-applies the dialog mode, throttle and mocks. If it cannot, the first receipt after the restart says so, for example `daemon restarted: dialog=dismiss, throttle=offline, 2 mocks were reset`.

**Actual:** Every setting returns to its default without any notice. The `netlog` buffer is lost too. The dialog reset is the risky part: an agent that used `dialog dismiss` to stay away from destructive `confirm()` dialogs gets them auto-accepted after the restart.

**Workaround:** Re-apply `dialog dismiss`, `throttle` and `mock` before every risky step, and read them back.

**Context:** Found while running a front-end QA pass with chrome-cdp-ex. Before the #549 fix, restarts happened about 10 times per session, and every throttle or mock check after one of them was silently invalid.

---

## 2. press: `Enter` does not trigger implicit form submission

**Environment:** chrome-cdp-ex 2bd2728 (2.20.0), HeadlessChrome 153.0.8010.12, Linux 6.8, Node 22.22.3

**Repro**
1. Page: `<form onsubmit="event.preventDefault();document.title='submitted'"><input name=a><button>Go</button></form>`, plus capture-phase listeners that log `keydown` / `keypress` / `keyup` / `click`.
2. `cdp click <t> "input[name=a]"`, then `cdp type <t> x`
3. `cdp press <t> Enter` prints `Pressed Enter.`
4. `cdp eval <t> "document.title"`

**Expected:** The page sees what a real Enter key press produces: keydown, keypress, a click on the default button, then submit. The title becomes `submitted`.

**Actual:** The title is still `idle`. The log shows only `keydown:Enter, keyup:Enter`: no keypress, no click, no submit.

**Workaround:** `cdp evalraw <t> Input.dispatchKeyEvent '{"type":"keyDown","key":"Enter","code":"Enter","windowsVirtualKeyCode":13,"text":"\r"}'`, then the matching keyUp.

**Context:** During keyboard-only accessibility checks, this makes "the form cannot be submitted with the keyboard" look like a product bug. Both QA runs reported it.

---

## 3. shot: a relative output path fails with ENOENT even when the directory exists

**Environment:** chrome-cdp-ex 2bd2728 (2.20.0), Linux 6.8, Node 22.22.3

**Repro**
1. `mkdir -p shots && cdp shot <t> shots/a.png`

**Expected:** The screenshot is written to `./shots/a.png`, relative to the caller's working directory.

**Actual:** `Error: ENOENT: no such file or directory, open 'shots/a.png'` with `Kind: unknown`. The path seems to be resolved against the daemon's working directory instead.

**Workaround:** Pass an absolute path.

**Context:** QA runs save evidence screenshots under a run directory, so a relative path is the natural thing to pass.

---

## 4. [proposal] viewport: report success when the size is applied

**Environment:** chrome-cdp-ex 2bd2728 (2.20.0), Linux 6.8, Node 22.22.3

**Repro:** `cdp viewport <t> 390x844` on any page

**Current:** The first line, `Viewport: 390x844 (DPR 1) (mobile mode)`, is correct. The receipt that follows says `Outcome: no-change — No visible AX tree change observed`, `Verdict: investigate` and `Blocking signals: fresh-perception-needed`.

**Proposal:** Treat "the size read back equals the size requested" as success for `viewport`. Print the one-line result, and attach an AX diff only when something changed.

**Context:** QA switches between desktop and phone sizes many times per run. Every switch currently reads like a failure that needs investigating.

---

## 5. [proposal] perceive: Visible controls lists `input[type=number]` as `textbox "textbox"`

**Environment:** chrome-cdp-ex 2bd2728 (2.20.0), Linux 6.8, Node 22.22.3

**Repro:** `<label>Qty <input type="number" name="qty"></label>`, then `cdp perceive <t> -C -d 8`

**Current:** The AX tree shows `[spinbutton] Qty @2`, but `[Visible controls]` shows `input role=textbox "textbox" ... @2`.

**Proposal:** Make Visible controls use the AX role and accessible name (`spinbutton "Qty"`), so both views agree.

**Context:** In QA, the accessible name is what the a11y checks look at. A generic `"textbox"` label looks like a missing label on the page.
