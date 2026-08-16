type EmptyStateProps = {
  title: string;
  message: string;
};

/**
 * Friendly full-page empty state — the site launches before the first week
 * is published, so both the home page and the archive need one.
 */
export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <section className="flex flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted-foreground max-w-md">{message}</p>
    </section>
  );
}
