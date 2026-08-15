/**
 * Minimal site chrome: name + two-link nav. Plain anchors (full-page
 * navigation) keep this component router-free and are fine for a two-page
 * SSR site; hidden in print so a printed page is just the week's content.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 print:hidden">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <a href="/" className="font-bold tracking-tight">
          {"Aubrey's Hungry"}
        </a>
        <nav aria-label="Site" className="flex gap-4 text-sm">
          <a href="/" className="underline-offset-4 hover:underline">
            This week
          </a>
          <a href="/weeks" className="underline-offset-4 hover:underline">
            Archive
          </a>
        </nav>
      </div>
    </header>
  );
}
