# Propagation

This doc is for agents tasked with propagating construct template changes to existing project instances.

---

## What Propagation Means

When construct is updated, some changes should be rolled out to projects that were previously scaffolded from it. This doc explains how to do that reliably.

---

## How Scaffolded Projects Track Their Template Version

Every project scaffolded from construct has a `.construct` JSON file at the repository root. This is the **single source of truth** for which template version the project was created from. The scaffold script (`scripts/scaffold.mjs`) writes this file automatically during setup.

The key field is **`constructVersion`** — it records the construct `package.json` version at the time of scaffolding. During propagation, you update this field to the current construct version after applying changes.

Always check `.construct` first when working with a scaffolded project. If the file is missing or the `constructVersion` field is absent, the project predates version tracking and should be treated as version `0.0.0`.

---

## Source of Truth During Propagation

Two documents describe what changed between versions: the **migration guide** (`docs/migrations/vX.Y.md`) and the **CHANGELOG** (`CHANGELOG.md`). They are not redundant:

| Document | Role | When it wins |
| -------- | ---- | ------------ |
| Migration guide | **Authoritative** — step-by-step playbook for applying changes | Always. It is the thing you execute. |
| CHANGELOG | **Discovery index** — which entries carry which propagation tag | When checking that no `[propagate]` item was forgotten in the migration guide |

**Rule:** follow the migration guide. Use the CHANGELOG only to cross-check that every `[propagate]` entry for the target version is represented in the guide. If a `[propagate]` CHANGELOG entry has no corresponding migration step, stop and flag it rather than guessing.

The migration guide wins because it encodes ordering and interdependencies (install before typecheck, copy before merge, etc.) that a flat changelog cannot.

---

## Setup

You will be pointed at a directory containing one or more construct instances. Each instance has a `.construct` file at its root:

```json
{
  "constructVersion": "0.2.0",
  "projectName": "my-project",
  "projectSlug": "my-project",
  "scaffoldedAt": "2026-04-13T00:00:00.000Z"
}
```

You will also have access to the current construct repo, its `CHANGELOG.md`, and its `docs/migrations/` directory.

---

## Propagation Workflow

For each instance in the target directory:

1. **Read `.construct`** — note the `constructVersion` the instance was scaffolded from.
2. **Open the migration guide(s)** — read `docs/migrations/vX.Y.md` for every version bump between the instance and construct. If the instance is on 0.1.0 and construct is on 0.2.0, read `v0.2.md`. If multiple jumps are needed, apply each guide in order.
3. **Cross-check with `CHANGELOG.md`** — scan entries newer than the instance's version and confirm every `[propagate]` entry has a corresponding step in the migration guide. If something is missing, stop and flag for human review.
4. **Skip `[template-only]`** entries. Flag `[manual]` entries for human review.
5. **Apply the migration guide** — follow its steps in order, respecting the instance's existing code.
6. **Update `.construct`** — bump `constructVersion` to the current construct version.
7. **Run `pnpm preflight` and `pnpm build`** — verify the instance is still healthy after changes.

---

## What Propagates vs What Stays Template-Only

| Category | Examples | Propagates? |
| -------- | -------- | ----------- |
| Conventions | `AGENTS.md`, `docs/agents/*` | Yes — merge with instance customizations |
| Tooling config | `biome.json`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `lefthook.yml`, `tsr.config.json`, `.gitignore` | Yes — additive only, preserve instance customizations |
| Scripts and deps | `package.json` scripts, dev deps, `pnpm.overrides`, `packageManager` | Yes |
| Example code | `app/utils/format.ts`, `app/components/Greeting.tsx`, `app/routes/__root.tsx`, `app/routes/index.tsx`, and co-located tests (`app/utils/format.test.ts`, `app/components/Greeting.test.tsx`, `app/env.test.ts`) | Yes — skip if instance has customized the file |
| CI workflows | `.github/workflows/ci.yml`, `.github/workflows/release-check.yml`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/*` | Yes |
| Instance-owned | `README.md`, `CHANGELOG.md`, `db/schema.ts`, most of `app/routes/`, `.env*`, `.construct` | **No** — never overwrite |
| Template-only | `TEMPLATE.md`, `docs/decisions/`, `docs/migrations/`, `scripts/scaffold.mjs`, `scripts/labels.mjs`, `.github/workflows/validate-template.yml` | **No** — these describe or validate construct itself |

---

## Rules

- **Never overwrite instance-specific files** — see the "Instance-owned" row above.
- **Never copy template-only files** — see the "Template-only" row above.
- **Config files are propagatable with care** — additive changes only; do not remove existing customizations.
- **If a change conflicts with instance code**, flag it for human review rather than guessing.
- **One instance at a time** — complete and verify each instance before moving to the next.

---

## Migration Guides

Every version bump to construct must include a corresponding migration guide in `docs/migrations/`. The guide is named after the target version (e.g., `v0.2.md` for the 0.1.0 to 0.2.0 migration). Use `docs/migrations/template.md` as the starting point.

A migration guide must contain:

- **Breaking Changes** — anything that will break existing instances if not addressed
- **Migration Steps** — an ordered checklist an agent can follow mechanically
- **Files Affected** — every file that changed, with a one-line description

The convention for version bumps (CHANGELOG entry + migration guide + PR template checkbox) is documented in `docs/agents/releases.md` and enforced by `.github/workflows/release-check.yml`.

---

## After Propagation

Leave a summary of what was applied, what was skipped, and what needs manual review. Format it as a short markdown file dropped into the instance root as `PROPAGATION_NOTES.md` — the human can delete it once reviewed.
