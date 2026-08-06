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
`docs/agents/orchestration.md`. Its refinements are now ported: the
deterministic review workflow (`.claude/workflows/adversarial-review.mjs`),
the `/orchestrate` + `review-loop` skills, and the CI review gate below.)

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

### Escalating unresolved items into the PR body

When shipping with unresolved items after the 2-round cap, add a section to
the PR description so the human reviewer sees exactly what is contested:

```md
## Unresolved review items (escalated after 2-round cap)
- **[major] <area>** — <summary>. Worker's rebuttal: <…>. Reviewer's concern: <…>.
```

Keep it factual: the finding, the worker's rebuttal, and why it stayed
contested. Do not silently drop a `CONFIRMED` blocker — if one remains, do
not ship.

## CI enforcement (the `adversarial-review` gate)

The loop is enforced as a hard PR gate by the `adversarial-review` job in
`.github/workflows/pr-conventions.yml`. To merge, a PR must satisfy **one** of:

- **`skip-review` label** — bypasses the gate for a trivial or human-only
  change; **or**
- **both** the **`review:adversarial-passed` label** **and** a well-formed
  **`## Adversarial review`** section in the PR body. That section must
  contain either a passing verdict (`overall: SHIP`, the schema above) or the
  escalation block (`Unresolved review items (escalated after 2-round cap)`).
  An empty or template-placeholder section fails. The exact rule lives in
  `.github/scripts/check-review-block.mjs` (`validateReviewBlock`). The job
  re-evaluates on `labeled`/`unlabeled`/`edited`, so adding the label or
  pasting the verdict re-runs it.

**Honest limitation.** CI cannot prove a genuine review occurred — the body
block could be fabricated and the `review:adversarial-passed` label
hand-applied. This gate is a **forcing function plus an auditable record, not
proof**. Likewise `skip-review` is a **human judgement call**: CI cannot
enforce *who* applied it or that the change truly warranted skipping. Treat
both as social contracts the gate makes visible, not guarantees.

**Relationship to the owner-review gate.** The adversarial-review loop is a
self/peer check that any reviewer can clear. It does **not** replace the
owner-review guardrail (`docs/agents/governance.md`): when a change touches an
owner-gated surface (dietary safety / cost / legal / security / destructive
data / process-config), the Dietary safety and Security dimensions above must
be probed *and* the PR is `safe:human` — merged by the owner, which no review
record or label can bypass. The `owner-review` job in the same workflow
enforces the label; there is no bypass label for it.

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
