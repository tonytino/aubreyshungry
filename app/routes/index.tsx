import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { EmptyState } from "~/components/EmptyState";
import { WeekDigest } from "~/components/WeekDigest";
import { getLatestWeekDigest } from "~/content/load";

// One-shot route data with no user input → a plain server function in the
// loader (docs/agents/api.md). Content is read from `content/` on the
// server; the client only ever sees the validated, serialized digest.
const getLatestDigest = createServerFn().handler(async () => getLatestWeekDigest());

export const Route = createFileRoute("/")({
  loader: () => getLatestDigest(),
  component: Home,
});

function Home() {
  const digest = Route.useLoaderData();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      {digest === null ? (
        <EmptyState
          title="No weeks published yet"
          message="The first weekly plan is on its way. Once it's published, the current week's menu, snacks, shopping list, and recipes will live here."
        />
      ) : (
        <WeekDigest digest={digest} />
      )}
    </main>
  );
}
