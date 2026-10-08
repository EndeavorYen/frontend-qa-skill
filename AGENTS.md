## Product goals

This section is the authoritative source for what `frontend-qa` is for. `skills/frontend-qa/SKILL.md` is the procedure; design and review against the rules below. When two goals conflict, use the trade-off order at the end of this section.

### Effective

The skill catches real front-end bugs. It does not invent bugs, and it does not miss bugs it claims to have checked.

- A product finding in `findings.md` counts only with evidence attached: a screenshot path under `shots/`, a Playwright repro spec (P0 and P1, as `references/repro.md` requires), or a probe result from `scripts/probe.mjs`. No evidence means it is not a finding.
- A conclusion that something is not a bug — a Critic rejection in `critic-verdicts.md`, an `unattributed.md` entry, or a cleared check — cites the same kinds of evidence. Do not keep or drop a conclusion you cannot point at.
- False positives and false negatives both fail this goal. On the seeded app, score them the way `evals/README.md` and `evals/seeded-app/ANSWER-KEY.md` already do: total catch rate, P0+P1 catch rate, and the false-positive count. Do not claim a detection change worked without those numbers, or without a stated reason the eval does not apply.
- A coverage cell is `✅` only after that check ran. `➖` and `⛔` include the reason the skill already requires.

### Efficient

Prefer fewer steps, fewer tokens, and faster runs.

- Do not add a workflow step, tool call, or output section that does not change a decision the run already records (finding, coverage cell, UX score, attribution, or cost line).
- Any change to the workflow, or to an output the skill writes (`coverage.md`, `findings.md`, `ux-review.md`, `critic-verdicts.md`, `tool-track.md`, `unattributed.md`, `report.md`, or probe output), reports before and after for steps, tokens, and time. When an eval covers the change, cite the before numbers from `evals/results/` and put the after numbers in a new file there. Published results record turns, minutes, and US$; they do not record tokens. State the token counts from the run log, or write that the log has no token count.
- Keep the trimming rules already in `SKILL.md`: filtered page reads, evidence screenshots stored under `shots/` and not read back into the transcript, and `scripts/probe.mjs` for checks that do not need a judgment.

### Easy for agents

An agent can execute the skill as written, without guessing.

- Every step in `skills/frontend-qa/SKILL.md` and `skills/frontend-qa/references/` names the file to write, the command to run, and the completion check. An instruction that needs unstated interpretation is a defect.
- Output formats stay stable. A change to a heading, table column, or filename in the run directory updates `references/report-template.md` and every reference that writes that file in the same change.
- On failure, say the cause and give one runnable next-step command (the probe command, the repro command in `evals/repro/README.md`, or the exact driver command that failed).

### Trade-off order

1. Effective
2. Easy for agents
3. Efficient

Do not buy a shorter run by dropping evidence, hiding a bug, or leaving a step ambiguous. Do not make a step easier for the agent by adding false positives or false negatives.

### Pull requests

Every PR body states the impact on Effective, Easy for agents, and Efficient. "No change" is a valid impact. A workflow or output change includes the before/after steps, tokens, and time from the Efficient rule.
