/**
 * Site footer. The disclaimer sentence is required verbatim
 * (docs/product/overview.md — no medical claims); do not reword it.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 print:hidden">
      <div className="text-muted-foreground mx-auto flex w-full max-w-3xl flex-col gap-1 px-4 py-6 text-sm">
        <p>
          {
            "This site documents one household's meal plan. It is not medical or nutritional advice."
          }
        </p>
        <p>
          Every plan is gluten-free, free of cashews and pistachios, and anti-inflammatory first.
        </p>
      </div>
    </footer>
  );
}
