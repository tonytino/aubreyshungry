import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { EmptyState } from "~/components/EmptyState";
import { listWeekSummaries } from "~/content/load";
import { formatWeekRange, weekLabel } from "~/utils/week-dates";

const getArchive = createServerFn().handler(async () => listWeekSummaries());

export const Route = createFileRoute("/weeks")({
  loader: () => getArchive(),
  component: Archive,
});

function Archive() {
  const weeks = Route.useLoaderData();

  if (weeks.length === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <EmptyState
          title="No weeks in the archive yet"
          message="Published weeks stay browsable here forever — the history is the point. The first one hasn't landed yet."
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Archive</h1>
      <p className="text-muted-foreground mt-1">Every published week, newest first.</p>
      <ul className="mt-6 divide-y divide-zinc-200">
        {weeks.map((week) => (
          <li key={week.weekStart}>
            <Link
              to="/week/$weekStart"
              params={{ weekStart: week.weekStart }}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4 hover:bg-zinc-50"
            >
              <span>
                <span className="font-semibold">{weekLabel(week.weekStart)}</span>{" "}
                <span className="text-muted-foreground text-sm">
                  {formatWeekRange(week.weekStart)}
                </span>
              </span>
              <span className="text-muted-foreground text-sm">
                {week.mealCount} {week.mealCount === 1 ? "meal" : "meals"} · {week.snackCount}{" "}
                {week.snackCount === 1 ? "snack" : "snacks"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
