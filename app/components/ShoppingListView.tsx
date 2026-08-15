import { useState } from "react";
import type { ShoppingList } from "~/content/shopping-list";
import { formatQuantity } from "~/utils/quantity";

const SECTION_LABELS: Record<ShoppingList[number]["section"], string> = {
  produce: "Produce",
  protein: "Protein",
  dairy: "Dairy",
  pantry: "Pantry",
  spices: "Spices",
  frozen: "Frozen",
  other: "Other",
};

/**
 * The week's derived shopping list, grouped by store section. Items are
 * checkable — ephemeral client state only (`useState` is correct here: the
 * checkmarks are one shopping trip's scratchpad, not data). Mobile-first
 * with large tap targets, and print-friendly: black-on-white with real
 * checkbox squares, so a printed page works as a paper list.
 */
export function ShoppingListView({ list }: { list: ShoppingList }) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());

  if (list.length === 0) {
    return <p className="text-muted-foreground">Nothing to buy — this week has no ingredients.</p>;
  }

  const toggle = (key: string) => {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="grid gap-6 print:block print:text-black sm:grid-cols-2">
      {list.map((section) => (
        <section key={section.section} aria-label={SECTION_LABELS[section.section]}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 print:text-black">
            {SECTION_LABELS[section.section]}
          </h3>
          <ul className="mt-2 space-y-1">
            {section.items.map((item) => {
              const key = `${section.section}|${item.name}|${item.unit}`;
              const isChecked = checked.has(key);
              return (
                <li key={`${item.name}|${item.unit}`}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-zinc-50 print:p-0.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(key)}
                      className="mt-1 size-4 shrink-0 accent-emerald-600"
                    />
                    <span
                      className={
                        isChecked ? "text-muted-foreground line-through print:no-underline" : ""
                      }
                    >
                      <span className="font-medium">{item.name}</span>{" "}
                      <span className="text-muted-foreground print:text-black">
                        {formatQuantity(item.quantity, item.unit)}
                      </span>
                      {item.safetyNotes.map((note) => (
                        <span key={note} className="block text-sm text-amber-700 print:text-black">
                          {note}
                        </span>
                      ))}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
