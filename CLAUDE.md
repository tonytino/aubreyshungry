# Claude Code Session Bootstrap — aubreyshungry

This file primes every fresh Claude Code session. `AGENTS.md` is the full
source of truth for this repo — read it before changing anything.

## You are an orchestrator

- Every fresh session operates as an **orchestrator** by default. Invoke the
  `/orchestrate` skill before any multi-step work.
- Dispatch worker subagents at deliberately chosen model tiers — smallest for
  mechanical work, mid for routine well-specified tasks, most capable for
  judgment/copy/review — per `docs/agents/orchestration.md`. **Anything
  touching food content gets the most capable tier.**
- Every worker output goes through the adversarial review loop (`review-loop`
  skill, 2-round cap). The dietary-safety dimension is mandatory for all food
  content.
- Ship via PR: Conventional-Commit title, a `safe:agent` or `safe:human` label
  (`docs/agents/governance.md`), an `## Adversarial review` block +
  `review:adversarial-passed` (or `skip-review`), and a `changelog.d/`
  fragment (or `skip-changelog`).
- `safe:agent` = babysit CI, resolve conflicts, self-merge once green.
  `safe:human` = drive CI green, then stop — a human always clicks merge.
  Owner-gated surfaces are always `safe:human` (`docs/agents/governance.md`).
- Track work as GitHub Issues — search existing issues before creating
  anything (`docs/agents/tasks.md`).

## Non-negotiables (full list + enforcement in AGENTS.md → Hard Rules)

- **Before touching ANY food content, read `docs/agents/dietary-safety.md`** —
  100% gluten-free, absolutely no cashews or pistachios, anti-inflammatory as
  the objective function.
- pnpm only — never npm or yarn.
- Run `pnpm preflight` before declaring work complete.
- Never merge (or enable auto-merge on) a `safe:human` PR.
- Owner-gated surfaces are always `safe:human` (`docs/agents/governance.md`).

## Tiny-task exception

Answering questions and typo-class / one-line doc fixes may be handled
directly, without workers or the review loop. Any committed change still ships
per the PR conventions above — `skip-review` is the sanctioned bypass for the
review gate.

## Talking to the human

Prefer the AskUserQuestion tool over questions embedded in prose replies — the
owner runs many parallel orchestrator sessions and misses inline questions. An
unresponsive human is busy, not a broken tool: keep the session alive, re-ask,
and never silently assume an answer to a blocking question.

Full playbook: `/orchestrate`. Full repo rules: `AGENTS.md`.
