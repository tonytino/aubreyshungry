---
name: orchestrate
description: Run a session as the orchestrator — GitHub Issues recon, worker dispatch by model tier, adversarial review, labeled PR, safe:agent self-merge or safe:human handoff. Use at the start of every session before multi-step work (CLAUDE.md directs every session here). Skip only for the tiny-task exception (questions, typo-class doc fixes).
---

# Orchestrate (Session Default)

Every session in this repo is an **orchestrator** — a standing owner
expectation, applied without being asked. The docs are the source of truth;
this skill routes you: `docs/agents/orchestration.md` (loop, model tiers,
shipping), `docs/agents/tasks.md` (issues, labels, PR conventions),
`docs/agents/governance.md` (owner-gated surfaces),
`docs/agents/dietary-safety.md` (the golden rules — read before ANY food
content).

**Tiny-task exception:** answering questions and typo-class / one-line doc
fixes may be handled directly — no workers, no loop. Committed changes still
ship per PR conventions (`skip-review` is the sanctioned bypass).

## Session lifecycle

1. **Issue recon.** Work is tracked as GitHub Issues. Search existing issues
   FIRST (`gh issue list`) — no duplicates. Claim the issue (assign yourself,
   relabel `status:in-progress`), then branch `issue-<n>-<slug>`
   (`docs/agents/tasks.md`).
2. **Decompose** the task into work units, each with an explicit spec +
   acceptance criteria.
3. **Dispatch workers.** Deliberately pick each subagent's model tier — the
   table lives in `docs/agents/orchestration.md`. **Anything touching food
   content gets the most capable tier**, generation and review both.
4. **Review.** Run the `review-loop` skill on every worker output — fresh
   Reviewer each round, 2-round cap; escalate unresolved items in the PR
   description. The dietary-safety dimension is mandatory for all food content.
5. **Ship the PR.** Conventional-Commit title (`type: description`); label
   `safe:agent` or `safe:human` per `docs/agents/governance.md`;
   `## Adversarial review` block + `review:adversarial-passed` (or
   `skip-review`); `changelog.d/` fragment (or `skip-changelog`);
   `Closes #<n>`. Check the owner-review gate: if the diff touches an
   owner-gated surface it MUST be `safe:human` (verify locally with
   `BASE_SHA=origin/main OWNER_REVIEW_LABELS=safe:agent node .github/scripts/check-owner-review.mjs`).
6. **Merge or hand off.**
   - `safe:agent`: babysit CI (subscribe to PR activity), fix reds, resolve
     conflicts, squash-merge on green, delete the branch.
   - `safe:human`: drive CI green, then stop and prompt the human. @tonytino
     reviews owner-gated PRs; the session owner reviews other judgment calls.
7. **Closeout.** `Closes #<n>` auto-closes the issue on merge; relabel
   `status:needs-review` before handoff when a human still reviews; unsubscribe
   PR activity.

## Talking to the human

Prefer AskUserQuestion over questions embedded in prose — structured prompts
surface across the owner's parallel sessions; inline questions get missed. An
unresponsive human is busy, not broken: keep the session alive, re-ask, and
never fabricate an answer to a blocking question.

## Hard rules

- A Reviewer is never the Worker — fresh, adversarial subagent every round.
- Never merge (or enable auto-merge on) a `safe:human` PR.
- Never skip the review loop outside the tiny-task exception.
- Never create a duplicate GitHub issue.
- Owner-gated ⇒ `safe:human`, no exceptions.
- Food content ⇒ golden rules (`docs/agents/dietary-safety.md`), no exceptions.
