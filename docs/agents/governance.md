# Owner-Review Guardrails

**Read this before opening any PR.** It defines the changes that require the
repo owner's (**@tonytino**) explicit review — everything else ships without
him. The goal: agents deliver most work autonomously; the owner is pulled in
only where the stakes demand it.

> One-line rule: **if your PR touches an owner-gated surface (below), label it
> `safe:human` and let @tonytino review + merge it. Otherwise label it
> `safe:agent` and ship it on green CI.** Agents never merge — or enable
> auto-merge on — a `safe:human` PR.

---

## The owner-gated categories

1. **Dietary safety** — the golden rules themselves
   (`docs/agents/dietary-safety.md`), the forbidden-ingredient linter and its
   term lists, and — until that linter exists and is trusted — **all
   generated/edited food content** (plans, recipes, snacks, shopping lists).
   On this product a safety miss can cause real-world harm; it is the most
   owner-caliber surface in the repo.
2. **Cost** — anything that creates or scales spend: LLM API usage in
   workflows, Neon, Vercel, scheduled job frequency.
3. **Legal / copyright** — recipe provenance (no republishing copyrighted
   recipe text, incl. NYT Cooking), licensing, terms, anything
   privacy-adjacent.
4. **Security** — secrets, workflow permissions, auth (if ever added),
   middleware chokepoints, dependency supply chain.
5. **Destructive / irreversible data changes** — data-loss migrations,
   deleting published weeks or rewriting the archive.
6. **Process & config surfaces** — `AGENTS.md`, `/.github/` (workflows, CODEOWNERS,
   templates), `docs/decisions/`, `docs/agents/governance.md`, `scripts/labels.mjs`,
   `package.json`, root configs. Loosening a guardrail must itself be owner-gated.

---

## Enforcement — current state and target

**Now:**

- **Layer 1 (the teeth):** `.github/CODEOWNERS` assigns the gated **paths** to
  @tonytino. Once branch protection with **Require review from Code Owners**
  is enabled (owner checklist below), owned-path PRs cannot merge without his
  review — regardless of labels.
- **Layer 2 (the tripwire) — live:** the **`owner-review` CI job**
  (`.github/workflows/pr-conventions.yml`, ported from
  [aubreyslist](https://github.com/tonytino/aubreyslist)) scans changed files
  against the gated paths **plus content signals** paths can't see —
  destructive SQL in migrations, the medical/nutritional-advice disclaimer
  copy, and a forbidden-ingredient tripwire in food-content files — and fails
  CI when a gated change isn't labeled `safe:human`. **No bypass label.** The
  policy lives in `.github/scripts/owner-review-paths.mjs`; a bidirectional
  unit test (`tests/unit/check-owner-review.test.ts`) fails the build if it
  ever drifts from `CODEOWNERS`. Verify locally with:
  `BASE_SHA=origin/main OWNER_REVIEW_LABELS=safe:agent node .github/scripts/check-owner-review.mjs`.
- **Honest limitations.** The CI job is a **forcing function + fast feedback,
  not the enforcement** — labels and CI can be worked around by anyone with
  merge rights; Layer 1 is what makes an owned-path PR unmergeable. And the
  content checks are best-effort heuristics: a gated change in an *unowned*
  file that evades the patterns has no Layer-1 backstop and can still merge
  as `safe:agent`. Honest classification remains the norm, and reviewers probe
  the Dietary safety and Security dimensions in every adversarial review
  (`docs/agents/orchestration.md`).

**Target (tracked as foundational issues):**

- The **forbidden-ingredient linter** (issue #3) as a required check on all
  food content — the content tripwire above is deliberately simple and is NOT
  that linter. When the linter is mature, routine weekly-plan PRs may graduate
  from `safe:human` to `safe:agent` — that graduation decision is itself
  owner-gated.

## Owner-only setup checklist (@tonytino)

Configure once in repo Settings (prefer a Ruleset on the default branch):

1. Require a PR before merging + **Require review from Code Owners**;
   required approvals = 0 (the code-owner rule fires only on owned paths, so
   unowned PRs stay agent-mergeable).
2. **Dismiss stale approvals on new pushes** — non-negotiable.
3. Empty bypass list; block force-push and deletion on the default branch;
   require conversation resolution; require the CI checks.
4. Agents authenticate as a **non-owner, non-admin** identity; owner
   credentials never go to an agent.
5. Out-of-band spend alerts (Vercel, Neon, LLM API budget) — path-ownership
   cannot see cost created by usage patterns.

---

## The merge norm (hard rule)

Agents must never take an action-as-a-human the human would disapprove of.
A human always clicks merge on a `safe:human` PR. Agents may self-merge
`safe:agent` PRs once CI is green and the adversarial review loop has run.
