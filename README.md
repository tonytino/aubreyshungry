# aubreyshungry

A weekly meal plan designed to help Aubrey live a life filled with
nutrient-rich, delicious meals that are **gluten-free**,
**anti-inflammatory**, and **free of cashews and pistachios**. Each week's
plan includes the full shopping list for the week to aid shopping ease and
optimizes for meal prepping, healthy snacking, and time-efficiency — with a
browsable archive of past weeks.

- **Product vision:** [`docs/product/overview.md`](./docs/product/overview.md)
- **The golden rules (read before any food content):**
  [`docs/agents/dietary-safety.md`](./docs/agents/dietary-safety.md)
- **How plans are generated:** [`docs/agents/generation.md`](./docs/agents/generation.md)

> This site documents one household's meal plan. It is not medical or
> nutritional advice.

## Stack

Scaffolded from [construct](https://github.com/tonytino/construct) (v0.3.0):

- **TanStack Start** — full-stack React framework
- **TanStack Router** — type-safe file-based routing
- **TanStack Query** — server state management
- **Tailwind CSS v4** — utility-first styling
- **Biome** — linting + formatting
- **Vitest** — unit and component testing
- **Playwright** — end-to-end testing
- **Hono** — API layer with RPC
- **Drizzle + Neon** — type-safe Postgres

## Getting Started

```bash
pnpm install
cp .env.example .env   # then fill in DATABASE_URL — see docs/agents/environment.md
pnpm dev
```

Running E2E tests? Install browsers first with `pnpm test:e2e:install`.

## For Agents

This repo is agent-first. Read [`AGENTS.md`](./AGENTS.md) fully before making
any changes — the dietary golden rules there are absolute.
