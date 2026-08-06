/**
 * Dietary-safety term lists — the machine-readable mirror of
 * `docs/agents/dietary-safety.md` (the source of truth).
 *
 * KEEP IN SYNC: any change to the terms below or to that doc is owner-gated
 * (`safe:human`, @tonytino review — see `docs/agents/governance.md`). Never
 * remove or weaken an entry without explicit owner sign-off.
 *
 * Matching contract (enforced by `scripts/dietary-safety/lint.mjs`):
 * - Every pattern is case-insensitive and word-boundary-aware, so containments
 *   like "buckwheat" never trigger the "wheat" rule.
 * - ALLOWLIST patterns are masked out of the text *before* forbidden matching
 *   runs, so known-safe phrases ("wheat-free", "certified gluten-free oats")
 *   cannot produce false positives.
 * - Within each forbidden list, more specific entries come first; the linter
 *   masks each match before trying later entries, so "cashew cream" reports
 *   the cream-specific substitute instead of a duplicate generic "cashew" hit.
 */

/**
 * @typedef {Object} ForbiddenTerm
 * @property {RegExp} pattern Case-insensitive, word-boundary-aware matcher.
 *   Must carry the `g` flag (the linter uses matchAll) and never the `y` flag.
 * @property {string} label Human-readable name for the matched ingredient.
 * @property {string} [substitute] Suggested safe replacement, where one exists.
 */

/** Rule 1 — gluten. A single hit is a critical bug. @type {ForbiddenTerm[]} */
export const FORBIDDEN_GLUTEN = [
  // Hidden traps first (most specific phrasing wins).
  {
    pattern: /\bsoy[ -]sauce\b/gi,
    label: "soy sauce (non-tamari; contains wheat)",
    substitute: "certified-GF tamari or coconut aminos",
  },
  {
    pattern: /\bbrewer[’']?s[ -]yeast\b/gi,
    label: "brewer's yeast",
    substitute: "nutritional yeast (verify GF)",
  },
  {
    pattern: /\boat(?:s|meal)?\b/gi,
    label: "oats (uncertified; standard oats are cross-contaminated)",
    substitute: 'certified gluten-free oats (always write "certified gluten-free oats")',
  },
  {
    pattern: /\bmalt(?:ed|s)?\b/gi,
    label: "malt (any form: malt extract/vinegar/syrup, malted grain)",
    substitute: "apple-cider vinegar (for malt vinegar); maple syrup or honey (for malt syrup)",
  },
  {
    pattern: /\bbeers?\b/gi,
    label: "beer (barley-based unless certified GF)",
    substitute: "omit, or a certified-GF alternative — prefer avoiding entirely",
  },
  {
    pattern: /\bseitan\b/gi,
    label: "seitan (pure wheat gluten)",
    substitute: "tofu, tempeh (certified GF), or mushrooms",
  },
  // Grains and derivatives.
  {
    pattern: /\bwheat\b/gi,
    label: "wheat (incl. whole wheat, wheat berries/germ/bran)",
    substitute: "GF 1:1 flour blend, or a GF whole grain (quinoa, brown rice, millet, buckwheat)",
  },
  { pattern: /\bbarley\b/gi, label: "barley", substitute: "quinoa or brown rice" },
  { pattern: /\brye\b/gi, label: "rye", substitute: "certified-GF bread or crackers" },
  { pattern: /\btriticale\b/gi, label: "triticale", substitute: "quinoa or millet" },
  { pattern: /\bspelt\b/gi, label: "spelt", substitute: "GF 1:1 flour blend" },
  { pattern: /\bfarro\b/gi, label: "farro", substitute: "quinoa, sorghum, or brown rice" },
  { pattern: /\beinkorn\b/gi, label: "einkorn", substitute: "GF 1:1 flour blend" },
  { pattern: /\bemmer\b/gi, label: "emmer", substitute: "quinoa or brown rice" },
  { pattern: /\bkamut\b/gi, label: "kamut", substitute: "quinoa or brown rice" },
  { pattern: /\bdurum\b/gi, label: "durum (wheat)", substitute: "brown-rice or chickpea pasta" },
  {
    pattern: /\bsemolina\b/gi,
    label: "semolina (wheat)",
    substitute: "brown-rice or chickpea pasta; GF cornmeal/polenta",
  },
  {
    pattern: /\bcouscous\b/gi,
    label: "couscous (wheat)",
    substitute: "quinoa or millet",
  },
  { pattern: /\bbulgur\b/gi, label: "bulgur (wheat)", substitute: "quinoa" },
  { pattern: /\bfreekeh\b/gi, label: "freekeh (wheat)", substitute: "quinoa or sorghum" },
];

/** Rule 2 — cashew/pistachio (life-threatening allergy). @type {ForbiddenTerm[]} */
export const FORBIDDEN_NUT = [
  // Derived products first, so the substitute suggestion is precise.
  {
    pattern: /\bcashew[ -](?:cream|cheese|sauce|queso)s?\b/gi,
    label: "cashew cream / vegan cashew cheese or sauce",
    substitute: "sunflower-seed cream, coconut cream, or white-bean purée",
  },
  {
    pattern: /\bcashew[ -]butters?\b/gi,
    label: "cashew butter",
    substitute: "sunflower-seed butter or almond butter (cross-contact-safe facility)",
  },
  {
    pattern: /\bcashew[ -]milks?\b/gi,
    label: "cashew milk",
    substitute: "coconut milk or almond milk (cross-contact-safe facility)",
  },
  {
    pattern: /\bcashew[ -]flours?\b/gi,
    label: "cashew flour",
    substitute: "almond flour (cross-contact-safe facility)",
  },
  {
    pattern: /\bcashews?\b/gi,
    label: "cashew (any form)",
    substitute: "allowed nuts/seeds: almonds, walnuts, pecans, pumpkin or sunflower seeds",
  },
  {
    pattern: /\bpistachio[ -]pastes?\b/gi,
    label: "pistachio paste",
    substitute: "pumpkin-seed (pepita) paste",
  },
  {
    pattern: /\bpistachios?\b/gi,
    label: "pistachio (any form)",
    substitute: "pumpkin seeds (pepitas)",
  },
  {
    pattern: /\bpink[ -]peppercorns?\b/gi,
    label: "pink peppercorn (Anacardiaceae — cross-reactive with cashew/pistachio)",
    substitute: "black or white peppercorns",
  },
  {
    pattern: /\bmixed[ -]nuts?\b/gi,
    label: "mixed nuts (cross-contact risk)",
    substitute: "single-nut products from dedicated cashew/pistachio-free processing",
  },
  {
    pattern: /\btrail[ -]mix(?:es)?\b/gi,
    label: "trail mix (cross-contact risk)",
    substitute: "homemade mix of allowed nuts/seeds and dried fruit",
  },
];

/**
 * Known-safe phrases that contain (or abut) a forbidden term but must NOT
 * trigger. The linter masks these out before running forbidden matching.
 * @type {RegExp[]}
 */
export const ALLOWLIST = [
  // Safe pseudo-grain — unrelated to wheat (word boundaries already protect
  // this; listed for explicitness and belt-and-braces safety).
  /\bbuckwheat\b/gi,
  // Negations / the safety phrasing itself.
  /\bwheat[ -]free\b/gi,
  /\bgluten[ -]free\b/gi,
  // The only acceptable oats phrasing (mask before the bare-"oats" trap).
  /\bcertified[ -]gluten[ -]free[ -]oat(?:s|meal)?\b/gi,
  /\bcertified[ -]gf[ -]oat(?:s|meal)?\b/gi,
];

/**
 * The rule sets the linter iterates, in order. `rule` names which golden rule
 * a hit violates (used verbatim in failure output).
 * @type {{ rule: string, terms: ForbiddenTerm[] }[]}
 */
export const RULE_SETS = [
  { rule: "Rule 1: 100% gluten-free", terms: FORBIDDEN_GLUTEN },
  { rule: "Rule 2: no cashews/pistachios (life-threatening allergy)", terms: FORBIDDEN_NUT },
];
