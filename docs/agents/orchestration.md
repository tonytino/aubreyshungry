# Orchestrating Multi-Agent Work

> **When orchestrating multi-agent work, run every worker output through the
> adversarial review loop below — cap at 2 review rounds.** Never ship a
> subagent's code, docs, or content until an independent, fresh Reviewer has
> tried to break it.

This repo is built agent-first: sessions orchestrate by default. Work is
tracked as GitHub Issues (`docs/agents/tasks.md`); an orchestrator claims
issues, dispatches workers, reviews adversarially, and ships per the
governance rules (`docs/agents/governance.md`).

(Pattern inherited from [aubreyslist](https://github.com/tonytino/aubreyslist)
`docs/agents/orchestration.md`; adopt its refinements — deterministic review
workflow, `/orchestrate` + `review-loop` skills, CI review gate — as they are
ported here. Porting them is tracked as a foundational issue.)

---

## Roles

| Role             | Responsibility                                                                          |
| ---------------- | --------------------------------------------------------------------------------------- |
| **Orchestrator** | Decomposes the task, dispatches workers, runs the review loop, makes the final ship call. |
| **Worker**       | Produces an output (code/docs/content) against an explicit spec + acceptance criteria.   |
| **Reviewer**     | A **fresh, adversarial** subagent that actively tries to break or refute the work.       |

The Reviewer must be a **new subagent each round** — never the worker
reviewing itself, never a reused context.

## Choosing a model per subagent

Pick each subagent's model deliberately, by tier:

| Tier | Use for |
| --- | --- |
| Smallest/fastest | Mechanical scans, greps, bulk enumeration. |
| Mid | Routine, well-specified searches and edits. |
| Most capable available | Meal-plan/recipe content, dietary-safety review, user-facing copy, adversarial review, ambiguity resolution. |

**Anything touching food content gets the most capable tier** — generation and
review both. When unsure, inherit the session model.

## The Loop

1. **Dispatch.** Worker gets an explicit spec + acceptance criteria.
2. **Round 1 review.** Fresh Reviewer probes every dimension below, returns
   the structured verdict.
3. **Address findings.** On `CHANGES_REQUESTED`, the **original** Worker
   (context preserved) fixes or rebuts each finding.
4. **Round 2 review.** A fresh Reviewer re-checks output + responses.
5. **Stop.** Ship if clean. After round 2, unresolved items are escalated to
   the human in the PR description — never silently dropped. A `CONFIRMED`
   blocker never ships.

## Review Dimensions

| Dimension           | What to attack                                                                 |
| ------------------- | ------------------------------------------------------------------------------ |
| **Dietary safety**  | ANY violation of the golden rules (`docs/agents/dietary-safety.md`): gluten in any form, cashew/pistachio in any form (watch cashew-cream vegan recipes), missing cross-contact notes, pro-inflammatory drift. This dimension is mandatory for all food content and its verdict must be stated explicitly in the PR body. |
| **Correctness**     | Logic bugs, edge cases, wrong assumptions, broken behavior.                     |
| **Security**        | Injection, secret exposure, workflow permissions, unsafe input handling.        |
| **Hard Rules**      | Any violation of `AGENTS.md` Hard Rules (`process.env`, `any`, `db` on client…). |
| **Copyright**       | Recipe text copied or closely paraphrased from copyrighted sources (NYT Cooking or elsewhere). |
| **Test honesty**    | No skipped, weakened, or missing tests; `pnpm preflight` must pass.             |
| **Scope creep**     | Unrequested changes, gold-plating, drive-by edits outside the spec.             |
| **Documentation drift** | Docs that no longer match the code/behavior the change introduced.          |

## Verdict Schema

```json
{
  "findings": [
    {
      "severity": "blocker" | "major" | "minor",
      "area": "string",
      "summary": "string",
      "verdict": "CONFIRMED" | "PLAUSIBLE" | "REFUTED",
      "required_change": "string"
    }
  ],
  "overall": "SHIP" | "CHANGES_REQUESTED",
  "notes": "string"
}
```

`overall` is `SHIP` only when no `blocker` or `major` finding stands
`CONFIRMED` or `PLAUSIBLE`. **Any dietary-safety finding is automatically a
`blocker`.**

## Shipping

- `safe:agent` PR + green CI + passing review loop → the orchestrator
  self-merges (squash), deletes the branch, closes out the issue labels.
- `safe:human` PR → stop at green. Request @tonytino (or the session owner for
  non-owner-gated judgment calls), summarize the review verdict and any
  escalated items in the PR body, and leave the merge to the human.
- Babysit CI on your PRs (subscribe to PR activity); conflicts and red checks
  are the orchestrator's job, not the human's.

## Talking to the human

Prefer structured question tools (AskUserQuestion) over questions buried in
prose. An unresponsive human is busy, not broken: park blocked work, continue
what you can, never fabricate an answer to a blocking question.
