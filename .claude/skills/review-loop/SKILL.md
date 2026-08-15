---
name: review-loop
description: Run the adversarial review loop on a worker subagent's output when orchestrating multi-agent work. Use whenever you are the orchestrator dispatching workers and must independently review their output (code/docs/content) before shipping it.
---

# Adversarial Review Loop

You are orchestrating multi-agent work. Every worker output gets an independent
adversarial review before it ships. Cap at **2 review rounds**.

## Checklist

1. **Read the playbook.** Open `docs/agents/orchestration.md` for the full
   roles, loop, review dimensions, verdict schema, and escalation rules. It is
   the source of truth; this skill only routes you.
2. **Pick the execution path:**
   - **Batch work →** delegate the deterministic fan-out to the
     `.claude/workflows/adversarial-review.mjs` workflow. It enforces the
     2-round cap and guarantees every worker output gets at least one review in
     code, not by model discretion. Prefer this whenever there is more than one
     output.
   - **Single interactive task →** run the loop manually via Agent-tool calls,
     following the numbered loop in the playbook.
3. **Run the loop (manual path):** dispatch the Worker with an explicit spec +
   acceptance criteria → spawn a **fresh** adversarial Reviewer → on
   `CHANGES_REQUESTED`, send the **original** Worker back to fix or rebut each
   finding → re-review with another fresh Reviewer.
4. **Stop at the cap.** Ship on `SHIP`. After **2 rounds**, do not loop
   further — the orchestrator decides and **escalates unresolved items to the
   human in the PR description**.

## Reviewer verdict schema

```json
{
  "findings": [
    { "severity": "blocker"|"major"|"minor", "area": "...", "summary": "...", "verdict": "CONFIRMED"|"PLAUSIBLE"|"REFUTED", "required_change": "..." }
  ],
  "overall": "SHIP"|"CHANGES_REQUESTED",
  "notes": "..."
}
```

Each Reviewer must be a **fresh subagent** with an adversarial mandate (try to
break the work) and must probe **dietary safety** (mandatory for all food
content — any finding is automatically a `blocker`, see
`docs/agents/dietary-safety.md`), correctness, security, repo Hard Rules
(AGENTS.md), copyright (no copied recipe text), test honesty (`pnpm preflight`
passes), scope creep, and documentation drift.
