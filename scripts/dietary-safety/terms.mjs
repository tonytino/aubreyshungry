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
 * - Multi-word terms use whitespace-tolerant separators (`[\s-]*`), so
 *   "soy  sauce" (multiple spaces), "soy\tsauce", line-wrapped "soy\nsauce",
 *   and closed compounds like "soysauce" all still match.
 * - Allergen terms (cashew/pistachio) deliberately over-match trailing word
 *   characters (`\w*`), so inflections and closed compounds ("cashewnut",
 *   "cashewnuts") cannot escape. Wheat covers its own closed compounds
 *   ("wholewheat", "wheatberries", "wheatgerm", "wheatgrass", "wheaten",
 *   "wheats") the same way.
 * - ALLOWLIST patterns are masked out of the text *before* forbidden matching
 *   runs, as the union of all matches over the ORIGINAL text, so known-safe
 *   phrases ("wheat-free", "certified gluten-free oats") cannot produce
 *   false positives and cannot shadow each other.
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
    pattern: /\bsoy[\s-]*sauces?\b/gi,
    label: "soy sauce (non-tamari; contains wheat)",
    substitute: "certified-GF tamari or coconut aminos",
  },
  {
    pattern: /\bbrewer[’']?s[\s-]*yeast\b/gi,
    label: "brewer's yeast",
    substitute: "nutritional yeast (verify GF)",
  },
  {
    pattern: /\boat(?:s|meal|en|cakes?)?\b/gi,
    label: "oats (uncertified; standard oats are cross-contaminated)",
    substitute: 'certified gluten-free oats (always write "certified gluten-free oats")',
  },
  {
    pattern: /\bmalt(?:ed|s)?\b/gi,
    label: "malt (any form: malt extract/vinegar/syrup, malted grain)",
    substitute: "apple-cider vinegar, or maple syrup/honey, depending on use",
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
  {
    pattern: /\bgluten\b/gi,
    label: 'gluten (incl. vital wheat gluten; the "gluten-free" phrase is allowlisted)',
    substitute: "omit — for baking structure use a GF 1:1 flour blend (with xanthan gum)",
  },
  // Grains, derivatives, and their closed compounds/inflections.
  {
    pattern: /\b(?:whole)?wheat\w*\b/gi,
    label: "wheat (incl. wholewheat, wheat berries/germ/bran, wheatgrass, wheaten)",
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
  // Common wheat-product vocabulary — Rule 1 forbids wheat "in any form".
  {
    pattern: /\bpankos?\b/gi,
    label: "panko (wheat breadcrumbs)",
    substitute: "certified-GF panko or crushed GF rice crackers",
  },
  {
    pattern: /\borzos?\b/gi,
    label: "orzo (wheat pasta)",
    substitute: "GF orzo or short-grain rice",
  },
  {
    pattern: /\budon\b/gi,
    label: "udon (wheat noodles)",
    substitute: "rice noodles or 100% buckwheat soba (certified GF)",
  },
  {
    pattern: /\bramen\b/gi,
    label: "ramen (wheat noodles unless certified GF)",
    substitute: "certified-GF rice ramen or rice noodles",
  },
  {
    pattern: /\bsobas?\b/gi,
    label: "soba (usually a wheat blend — only 100% buckwheat, certified GF, is safe)",
    substitute: '100% buckwheat soba (certified GF) — write it as "buckwheat soba"',
  },
  {
    pattern: /\bgrahams?\b/gi,
    label: "graham (graham flour/crackers — wheat)",
    substitute: "certified-GF graham-style crackers",
  },
  {
    pattern: /\bfarina\b/gi,
    label: "farina (wheat hot cereal)",
    substitute: "cream of rice, or certified gluten-free oatmeal",
  },
  {
    pattern: /\b(?:phyllo|filo)\b/gi,
    label: "phyllo/filo (wheat pastry)",
    substitute: "certified-GF puff pastry, or omit",
  },
  {
    pattern: /\bmatz(?:o|oh|a|ah)s?\b/gi,
    label: "matzo (wheat)",
    substitute: "certified-GF matzo-style crackers",
  },
  // Wheat staples: flours, breads, and bread products (wheat unless stated).
  {
    pattern:
      /\b(?:all[\s-]*purpose|self[\s-]*(?:ris|rais)ing|bread|cake|pastry|plain|00)[\s-]+flours?\b/gi,
    label: "wheat flour (all-purpose/bread/cake/pastry/self-rising/plain/00)",
    substitute: "GF 1:1 flour blend",
  },
  {
    pattern: /\bflour[\s-]+tortillas?\b/gi,
    label: "flour tortilla (wheat)",
    substitute: "corn tortillas (certified GF)",
  },
  {
    pattern: /\bbread[\s-]*crumbs?\b/gi,
    label: "breadcrumbs (wheat)",
    substitute: "certified-GF breadcrumbs, or crushed GF rice crackers",
  },
  {
    pattern: /\bcroutons?\b/gi,
    label: "croutons (wheat bread)",
    substitute: "toasted certified-GF bread cubes",
  },
  {
    pattern: /\bpretzels?\b/gi,
    label: "pretzel (wheat)",
    substitute: "certified-GF pretzels",
  },
  {
    pattern: /\bcroissants?\b/gi,
    label: "croissant (wheat pastry)",
    substitute: "certified-GF pastry, or omit",
  },
  {
    pattern: /\bbaguettes?\b/gi,
    label: "baguette (wheat bread)",
    substitute: "certified-GF baguette",
  },
  {
    pattern: /\bbrioches?\b/gi,
    label: "brioche (wheat bread)",
    substitute: "certified-GF bread",
  },
  {
    pattern: /\bchallahs?\b/gi,
    label: "challah (wheat bread)",
    substitute: "certified-GF bread",
  },
  {
    pattern: /\bnaans?\b/gi,
    label: "naan (wheat flatbread)",
    substitute: "certified-GF naan, or corn tortillas (certified GF)",
  },
  {
    pattern: /\bpitas?\b/gi,
    label: "pita (wheat flatbread)",
    substitute: "certified-GF pita, or corn tortillas (certified GF)",
  },
  {
    pattern: /\bbagels?\b/gi,
    label: "bagel (wheat)",
    substitute: "certified-GF bagel",
  },
  {
    pattern: /\bfocaccias?\b/gi,
    label: "focaccia (wheat bread)",
    substitute: "certified-GF bread",
  },
  {
    pattern: /\bciabattas?\b/gi,
    label: "ciabatta (wheat bread)",
    substitute: "certified-GF bread",
  },
  {
    pattern: /\bsourdoughs?\b/gi,
    label: "sourdough (wheat unless stated)",
    substitute: "certified-GF sourdough",
  },
];

/**
 * Rule 1 tier 2 — staples that are wheat by default and must ALWAYS be
 * written with an explicit GF qualifier (the doc: "always name the GF
 * substitute explicitly"). Scanned AFTER the specific gluten and allergen
 * sets, so precise entries ("flour tortilla", "cashew flour") report first.
 * Safe qualified phrasings ("GF 1:1 flour blend", "brown-rice pasta",
 * "corn tortillas") are ALLOWLIST entries and never trigger these.
 * @type {ForbiddenTerm[]}
 */
export const NEEDS_QUALIFIER = [
  {
    pattern: /\bflours?\b/gi,
    label: "flour (unqualified — assume wheat)",
    substitute: "GF 1:1 flour blend, or a named GF flour (almond, rice, chickpea, coconut)",
  },
  {
    pattern: /\bpastas?\b/gi,
    label: "pasta (unqualified — assume wheat)",
    substitute: "brown-rice or chickpea pasta, or another named GF pasta",
  },
  {
    pattern: /\bbreads?\b/gi,
    label: "bread (unqualified — assume wheat)",
    substitute: "certified gluten-free bread (named explicitly)",
  },
  {
    pattern: /\bnoodles?\b/gi,
    label: "noodles (unqualified — assume wheat)",
    substitute: "rice noodles or zucchini noodles",
  },
  {
    pattern: /\btortillas?\b/gi,
    label: "tortillas (unqualified — assume wheat)",
    substitute: "corn tortillas (certified GF)",
  },
];

/** Rule 2 — cashew/pistachio (life-threatening allergy). @type {ForbiddenTerm[]} */
export const FORBIDDEN_NUT = [
  // Derived products first, so the substitute suggestion is precise.
  {
    pattern: /\bcashew[\s-]*(?:cream|cheese|sauce|queso)s?\b/gi,
    label: "cashew cream / vegan cashew cheese or sauce",
    substitute: "sunflower-seed cream, coconut cream, or white-bean purée",
  },
  {
    pattern: /\bcashew[\s-]*butters?\b/gi,
    label: "cashew butter",
    substitute: "sunflower-seed butter or almond butter (cross-contact-safe facility)",
  },
  {
    pattern: /\bcashew[\s-]*milks?\b/gi,
    label: "cashew milk",
    substitute: "coconut milk or almond milk (cross-contact-safe facility)",
  },
  {
    pattern: /\bcashew[\s-]*flours?\b/gi,
    label: "cashew flour",
    substitute: "almond flour (cross-contact-safe facility)",
  },
  {
    // Deliberate over-match: catches cashews, cashewnut(s), cashewy, etc.
    pattern: /\bcashew\w*/gi,
    label: "cashew (any form, incl. closed compounds like cashewnut)",
    substitute: "allowed nuts/seeds: almonds, walnuts, pecans, pumpkin or sunflower seeds",
  },
  {
    pattern: /\bpistachio[\s-]*pastes?\b/gi,
    label: "pistachio paste",
    substitute: "pumpkin-seed (pepita) paste",
  },
  {
    // Deliberate over-match: catches pistachios and any closed compound.
    pattern: /\bpistachio\w*/gi,
    label: "pistachio (any form)",
    substitute: "pumpkin seeds (pepitas)",
  },
  {
    pattern: /\bpink[\s-]*peppercorns?\b/gi,
    label: "pink peppercorn (Anacardiaceae — cross-reactive with cashew/pistachio)",
    substitute: "black or white peppercorns",
  },
  {
    pattern: /\bmixed[\s-]*nuts?\b/gi,
    label: "mixed nuts (cross-contact risk)",
    substitute: "single-nut products from a dedicated allergen-safe facility",
  },
  {
    pattern: /\btrail[\s-]*mix(?:es)?\b/gi,
    label: "trail mix (cross-contact risk)",
    substitute: "homemade mix of allowed nuts/seeds and dried fruit",
  },
  {
    pattern: /\bbaklavas?\b/gi,
    label: "baklava-style dessert (traditionally pistachio/walnut — cross-contact risk)",
    substitute: "dessert with allowed nuts (e.g. walnuts) from a dedicated allergen-safe facility",
  },
  {
    pattern: /\bkormas?\b/gi,
    label: "korma (commonly cashew-thickened — verify/adapt)",
    substitute: "adapt: thicken with coconut cream or sunflower-seed butter, never nut-based",
  },
];

/**
 * Known-safe phrases that contain (or abut) a forbidden term but must NOT
 * trigger. The linter masks the union of all matches (computed against the
 * original text) before forbidden matching, so entries never shadow each
 * other. Separators are whitespace-tolerant, mirroring the forbidden terms.
 * @type {RegExp[]}
 */
export const ALLOWLIST = [
  // Safe pseudo-grain — unrelated to wheat (word boundaries already protect
  // this; listed for explicitness and belt-and-braces safety).
  /\bbuckwheat\b/gi,
  // 100% buckwheat soba is the only acceptable soba phrasing.
  /\b(?:100%[\s-]*)?buckwheat[\s-]+sobas?(?:[\s-]+noodles?)?\b/gi,
  // Negations / the safety phrasing itself (incl. closed compounds). The
  // lookahead stops over-masking "wheat free-range" style run-ons: "free"
  // followed by a hyphenated word is not a negation of the grain.
  /\bwheat[\s-]*free\b(?!-\w)/gi,
  /\bgluten[\s-]*free\b(?!-\w)/gi,
  // The only acceptable oats phrasing (mask before the bare-"oats" trap).
  /\bcertified[\s-]+gluten[\s-]*free[\s-]+oat(?:s|meal|en|cakes?)?\b/gi,
  /\bcertified[\s-]+gf[\s-]+oat(?:s|meal|en|cakes?)?\b/gi,
  // Doc-mandated safe phrasings for staples — the exact wordings this
  // linter's own substitutes recommend must never re-trip the linter.
  /\b(?:certified[\s-]+)?(?:gf|gluten[\s-]*free)[\s-]+(?:1[\s-]*:[\s-]*1[\s-]+)?flours?(?:[\s-]+blends?)?\b/gi,
  /\b(?:certified[\s-]+)?(?:gf|gluten[\s-]*free)[\s-]+(?:bread[\s-]*crumbs?|breads?|pastas?|noodles?|tortillas?|croutons?|pretzels?|pankos?|orzos?|pitas?|bagels?|naans?|baguettes?|sourdoughs?|focaccias?|ciabattas?|matzo[\s-]*style|graham[\s-]*style)\b/gi,
  /\b(?:brown[\s-]*)?rice[\s-]+(?:pastas?|noodles?|ramen|flours?)\b/gi,
  /\b(?:almond|chickpea|coconut|cassava|buckwheat|sorghum|millet|quinoa|corn|tapioca|potato|lentil)[\s-]+flours?\b/gi,
  /\b(?:chickpea|lentil|red[\s-]*lentil|quinoa)[\s-]+pastas?\b/gi,
  /\bcorn[\s-]+tortillas?\b/gi,
  /\b(?:zucchini|shirataki|kelp)[\s-]+noodles?\b/gi,
];

/**
 * The rule sets the linter iterates, in order. `rule` names which golden rule
 * a hit violates (used verbatim in failure output).
 * @type {{ rule: string, terms: ForbiddenTerm[] }[]}
 */
export const RULE_SETS = [
  { rule: "Rule 1: 100% gluten-free", terms: FORBIDDEN_GLUTEN },
  { rule: "Rule 2: no cashews/pistachios (life-threatening allergy)", terms: FORBIDDEN_NUT },
  {
    rule: "Rule 1: 100% gluten-free (unqualified staple — name the GF variant)",
    terms: NEEDS_QUALIFIER,
  },
];
