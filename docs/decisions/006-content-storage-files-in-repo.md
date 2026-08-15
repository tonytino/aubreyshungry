# ADR-006: Content Storage — Files in Repo for v1, over Neon

## Status

Accepted

## Context

Weekly plan content (weeks, recipes, snacks, shopping lists) needs a home before the generation pipeline or any content feature can be built. Two candidates existed, both flagged as an open decision in `docs/agents/domain.md` and `docs/agents/generation.md`:

1. **Content files in the repo**, with git as the history.
2. **Neon/Drizzle**, already in the stack (ADR-003).

Neon has real advantages: SQL queryability (search, tagging, "every week featuring salmon"), first-class relations between weeks and recipes, and no need to load-and-parse files at build time. But for v1 those advantages are mostly latent, and the costs are immediate: a database to provision, pay for, and operate; a publishing pipeline that must write to it (the generation cron would need DB credentials and a deploy-coupled write step instead of just opening a PR); and — most importantly — the properties the product actually depends on would have to be **bolted on**. The site is read-only, "generation is a PR, never a direct publish" is a pipeline principle, and "weeks are immutable once published" is a domain invariant. With a database, PR-gated review, diffable history, and immutability all require custom machinery (audit tables, snapshotting, a review UI). With files in git, they fall out for free: a generated week *is* a PR diff, CI gates (the forbidden-ingredient linter above all) run on the exact content being published, and merged history is the archive.

A secondary question was format: markdown-with-frontmatter vs structured JSON. The domain doc is explicit that structured ingredients are load-bearing — the shopping-list aggregation and the forbidden-ingredient linter both consume them, and `docs/agents/domain.md` forbids burying ingredients in prose. Prose-first formats invite exactly that failure: an ingredient mentioned in a step or note but absent from the structured list. For content where a missed ingredient is a safety bug (`docs/agents/dietary-safety.md`), the format should narrow that failure mode as far as the format can: schema-required structured ingredients make omissions detectable and aggregation possible. Narrow, not eliminate — prose fields (`steps`, `notes`) still exist in JSON, so full-content linting remains mandatory (see Consequences).

A third question was whether recipes inline into week files or form a shared library. Recipes are reused across weeks: deduplication is what makes variety tracking possible ("don't repeat last week" needs to know two weeks used the *same* recipe, not textually similar ones) and gives the shopping-list aggregation one canonical structured ingredient list per dish. So recipes are a separate library, referenced by slug.

## Decision

Content lives in the repo as JSON files for v1: one file per week at `content/weeks/<ISO-week>.json` (e.g. `content/weeks/2026-W32.json`) plus a shared recipe library at `content/recipes/<slug>.json`, with weeks referencing recipes by slug. All files are validated by Zod schemas (issue #2) at every boundary — generation output, CI, and build. Neon/Drizzle stays in the stack, unused for content, explicitly reserved for later features (search, tagging, cross-week queries) if and when they justify it.

## Consequences

### Layout

- `content/weeks/<ISO-week>.json` — one file per published week: status, menu (meal entries referencing recipes by slug, with day coverage and style), snacks, notes. The derived shopping list is **not** stored; see below.
- `content/recipes/<slug>.json` — one file per recipe (including snack recipes), owning the structured ingredient list, steps, storage notes, and golden-rule callouts. Slugs are stable identifiers; renaming a slug is a breaking change to every week that references it.
- Do not create these directories or schemas ahead of need — issue #2 implements the Zod schemas; content lands via the generation pipeline.
- No markdown-with-frontmatter for content. Prose belongs in designated fields (`notes`, `steps`) inside validated JSON; ingredients exist only as structured `Ingredient` objects. A prose field that mentions an ingredient absent from the structured list is a content bug — fix the structured list.
- The forbidden-ingredient linter must scan **every field of every content file, including prose fields** (`steps`, `notes`, safety callouts) — not just the structured ingredient arrays. Structured ingredients enable aggregation and per-ingredient checks; they do not replace full-content scanning.

### Shopping-list derivation

The shopping list is computed at build time, never stored or hand-edited: the build reads the week file, resolves each referenced recipe from `content/recipes/`, validates everything with the Zod schemas, then aggregates all ingredients across meals + snacks — merged by name and unit, grouped by store section, safety notes carried through. This preserves the domain invariant that the recipes are the source of truth and the list is always derivable from them. A dangling recipe reference is a build failure, not a silently shorter list.

### "Immutable once published," in git terms

- Published means merged to `main`. Content files on `main` are never edited by direct commit — `main` takes content changes only through the PR + CI-gates path (regeneration or targeted edit, per `docs/agents/generation.md`).
- A regenerated or edited week updates the same `content/weeks/<ISO-week>.json` file via PR; the file always holds the currently-published version, and every superseded version remains recoverable in git history (`git log -- content/weeks/2026-W32.json`). The archive's trustworthiness is the commit history itself, so no force-pushes to `main`, and published week files are never deleted or renamed.
- **Shared-recipe edits are week regenerations.** Editing `content/recipes/<slug>.json` retroactively changes every published week that references it — its rendered recipe *and* its derived shopping list — without touching any week file. So an edit to a recipe referenced by any published week is defined as a regeneration of all referencing published weeks: it takes the same PR + gates path, the PR body must enumerate the affected weeks, and CI should enumerate referencing weeks automatically once the tooling exists. If a change should apply only going forward (e.g. "less salt next time"), do not edit the shared recipe — add a new recipe under a new slug and reference it from the new week. Rejected alternatives: copy-on-write versioned recipe files (defeats dedup — variety tracking would see two slugs for one dish) and pinning full recipe content into week files (duplicates ingredient data, letting the linter's and shopping list's inputs diverge from the library).
- Accepted cost of files-in-repo: concurrent PRs touching the same shared recipe file can merge-conflict and must be resolved with ordinary git conflict resolution — there is no row-level locking as a database would give.
- All PRs touching `content/` are food-content PRs: golden-rule enforcement applies (`docs/agents/dietary-safety.md`), including the `safe:human` label until the forbidden-ingredient linter is proven.

### Migration path to a database

If search/tagging/query features later justify Neon, the Zod schemas are the contract and they stay. Content access goes through one storage-adapter module (read a week, list weeks, resolve a recipe) rather than scattered `fs` calls, so a Drizzle-backed implementation can swap in behind the same interface, with the JSON files becoming the seed/import data and git remaining the review path. The move is additive — do not build DB-backed content features by bypassing the adapter or the PR publishing flow.

### Deliberately left open

- The exact schema field shapes — issue #2, guided by `docs/agents/domain.md`.
- Whether buy-this snack products (no recipe, just a product + safety note) get entries in `content/recipes/` or a dedicated library; decide when the snack schema is written.
