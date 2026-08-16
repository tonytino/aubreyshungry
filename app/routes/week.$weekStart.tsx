import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { WeekDigest } from "~/components/WeekDigest";
import { getWeekDigest } from "~/content/load";
import { WeekStartSchema } from "~/content/schema";

const getDigestForWeek = createServerFn()
  .validator(z.object({ weekStart: WeekStartSchema }))
  .handler(async ({ data }) => getWeekDigest(data.weekStart));

export const Route = createFileRoute("/week/$weekStart")({
  loader: async ({ params }) => {
    // A malformed identifier is a 404, not a validation crash. This also
    // keeps the non-Sunday case off the server function and out of
    // `weekStartDate`, both of which reject it by throwing.
    if (!WeekStartSchema.safeParse(params.weekStart).success) {
      throw notFound();
    }
    const digest = await getDigestForWeek({ data: { weekStart: params.weekStart } });
    if (digest === null) {
      throw notFound();
    }
    return digest;
  },
  component: WeekPage,
  notFoundComponent: WeekNotFound,
});

function WeekPage() {
  const digest = Route.useLoaderData();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <WeekDigest digest={digest} />
    </main>
  );
}

function WeekNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 px-4 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Week not found</h1>
      <p className="text-muted-foreground max-w-md">
        That week hasn't been published (or the address is mistyped).
      </p>
      <div className="flex gap-4 text-sm">
        <Link to="/" className="underline underline-offset-4">
          Current week
        </Link>
        <Link to="/weeks" className="underline underline-offset-4">
          Browse the archive
        </Link>
      </div>
    </main>
  );
}
