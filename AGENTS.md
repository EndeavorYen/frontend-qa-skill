## Product goals

This section is the authoritative source for what `frontend-qa` is for. `skills/frontend-qa/SKILL.md` is the procedure; design and review against the rules below. When two goals conflict, use the trade-off order at the end of this section.

### Effective

The skill catches real front-end bugs. It does not invent bugs, and it does not miss bugs it claims to have checked.

- A product finding in `findings.md` counts only with evidence attached. The minimum is one of these: a screenshot path under `shots/`, a Playwright repro spec, or a probe result from `skills/frontend-qa/scripts/probe.mjs`. No evidence means it is not a finding. That list is a minimum. The skill's own rules are stricter and still apply: every finding needs a screenshot, including P3, and P0 and P1 also need a Playwright repro spec. See 證據規則 in [`skills/frontend-qa/SKILL.md`](skills/frontend-qa/SKILL.md#證據規則) and [`skills/frontend-qa/references/report-template.md`](skills/frontend-qa/references/report-template.md#findingsmd).
- A conclusion that something is not a bug — a Critic rejection in `critic-verdicts.md`, an `unattributed.md` entry, or a cleared check — cites at least one of those same kinds of evidence (a screenshot path, a repro spec, or a probe result). Do not keep or drop a conclusion you cannot point at. A cleared check is a suspected issue that was investigated and then not filed. It is not every `✅` cell. The coverage map has one remark column per row; put the paths there as `證據：<round>→<path>`, with multiple paths separated by `；`. See [`skills/frontend-qa/references/report-template.md`](skills/frontend-qa/references/report-template.md#coveragemd).
- False positives and false negatives both fail this goal. On the seeded app, score them the way `evals/README.md` and `evals/seeded-app/ANSWER-KEY.md` already do: total catch rate, P0+P1 catch rate, and the false-positive count. Do not claim a detection change worked without those numbers, or without a stated reason the eval does not apply.
- A coverage cell is `✅` only after that check ran. `➖` and `⛔` include the reason the skill already requires.

### Efficient

Prefer fewer steps, fewer tokens, and faster runs.

- Do not add a workflow step, tool call, or output section that does not change a decision the run already records (finding, coverage cell, UX score, attribution, or cost line).
- Any change to the workflow, or to an output the skill writes (`coverage.md`, `findings.md`, `ux-review.md`, `critic-verdicts.md`, `tool-track.md`, `unattributed.md`, `report.md`, or probe output), reports before and after for steps, tokens, and time. When an eval covers the change, cite the before numbers from `evals/results/` and put the after numbers in a new file there. Published results record turns, minutes, and US$; they do not record tokens. State the token counts from the run log, or write that the log has no token count.
- Keep the trimming rules already in `skills/frontend-qa/SKILL.md`: filtered page reads, evidence screenshots stored under `shots/` and not read back into the transcript, and `skills/frontend-qa/scripts/probe.mjs` for checks that do not need a judgment.

### Easy for agents

An agent can execute the skill as written, without guessing.

- Every step in `skills/frontend-qa/SKILL.md` and `skills/frontend-qa/references/` names the file to write, the command to run, and the completion check. An instruction that needs unstated interpretation is a defect.
- Output formats stay stable. A change to a heading, table column, or filename in the run directory updates `skills/frontend-qa/references/report-template.md` and every file under `skills/frontend-qa/references/` that writes that file in the same change.
- On failure, say the cause and give one runnable next-step command: the probe command, the repro command for that run (`cd .frontend-qa/<run>/repro && BASE_URL=<url> npx --no-install playwright test --reporter=line`, as [`skills/frontend-qa/references/repro.md`](skills/frontend-qa/references/repro.md#驗證腳本) describes), or the exact driver command that failed. `npx playwright test -c <repo>/evals/repro` applies only to seeded-app evals; [`evals/repro/README.md`](evals/repro/README.md) is that example, not the command for any other target.

### Trade-off order

1. Effective
2. Easy for agents
3. Efficient

Do not buy a shorter run by dropping evidence, hiding a bug, or leaving a step ambiguous. Do not make a step easier for the agent by adding false positives or false negatives.

### Pull requests

Every PR body states the impact on Effective, Easy for agents, and Efficient. "No change" is a valid impact. A workflow or output change includes the before/after steps, tokens, and time from the Efficient rule. Do not paste absolute paths from the runner into the PR body. Cite repo-relative paths and the command result.
