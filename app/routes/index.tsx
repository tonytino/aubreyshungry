import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

// Example server function — runs only on the server, callable from loaders or
// components.  Use server functions for data that is tightly coupled to this
// route and does not need to be exposed as a standalone API endpoint.
// See docs/agents/api.md for the full decision rule.
const getWelcome = createServerFn().handler(async () => {
  return { message: "Hello from a server function", timestamp: Date.now() };
});

// Example TanStack Query. The queryFn is a server function, so it runs on the
// server during SSR prefetch and as a typed RPC on the client — no self-fetch.
const getItems = createServerFn().handler(async () => {
  return [
    { id: "1", name: "First item" },
    { id: "2", name: "Second item" },
  ];
});

const itemsQuery = queryOptions({
  queryKey: ["items"],
  queryFn: () => getItems(),
});

export const Route = createFileRoute("/")({
  // Prefetch the query on the server so it's dehydrated into the HTML and
  // hydrated on the client (no loading flash); useSuspenseQuery then reads it
  // synchronously. Rule of thumb: use Query for data you cache/refetch/share;
  // use a plain server function (like getWelcome) for one-shot route data.
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(itemsQuery);
    return getWelcome();
  },
  component: Home,
});

function Home() {
  const { message, timestamp } = Route.useLoaderData();
  const { data: items } = useSuspenseQuery(itemsQuery);

  // Format the time on the client only. `toLocaleTimeString()` depends on the
  // runtime's locale/timezone, so rendering it during SSR and again on the
  // client produces a hydration mismatch. Start empty (matching the server
  // markup) and fill it in after mount.
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  useEffect(() => {
    setLoadedAt(new Date(timestamp).toLocaleTimeString());
  }, [timestamp]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold tracking-tight">App Template</h1>
      <p className="text-muted-foreground text-lg">{message}</p>
      <ul className="text-muted-foreground text-sm">
        {items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
      <p className="text-muted-foreground text-sm">
        {loadedAt ? `Loaded at ${loadedAt}` : "Loading…"}
      </p>
    </main>
  );
}
