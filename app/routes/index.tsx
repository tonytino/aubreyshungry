import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { EmptyState } from "~/components/EmptyState";
import { WeekDigest } from "~/components/WeekDigest";
import { getHomeDigest } from "~/content/load";
import { formatWeekRange } from "~/utils/week-dates";

// One-shot route data with no user input → a plain server function in the
// loader (docs/agents/api.md). Content is read from `content/` on the
// server; the client only ever sees the validated, serialized digest.
//
// "Which week is current?" is decided HERE, on the server, exactly once —
// never during render. It depends on the clock and on America/Denver, so
// resolving it in a component would let a server in UTC and a browser
// elsewhere pick different weeks and blow up hydration. See the warning in
// `app/utils/denver-today.ts`.
const getHome = createServerFn().handler(async () => getHomeDigest());

export const Route = createFileRoute("/")({
  loader: () => getHome(),
  component: Home,
});

function Home() {
  const home = Route.useLoaderData();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      {home === null ? (
        <EmptyState
          title="No weeks published yet"
          message="The first weekly plan is on its way. Once it's published, the current week's menu, snacks, shopping list, and recipes will live here."
        />
      ) : (
        <>
          {/*
            Shown only when a newer plan exists. "Next" means the next week
            published after the one on screen — usually literally next week,
            and still the right thing to point at after a skipped week.
            formatWeekRange is pure, so rendering it here is hydration-safe.
          */}
          {home.newerWeekStart !== null && (
            <p className="mb-6 text-sm print:hidden">
              <Link
                to="/week/$weekStart"
                params={{ weekStart: home.newerWeekStart }}
                className="underline underline-offset-4"
              >
                Next week: {formatWeekRange(home.newerWeekStart)}
              </Link>
            </p>
          )}
          <WeekDigest digest={home.digest} />
        </>
      )}
    </main>
  );
}
