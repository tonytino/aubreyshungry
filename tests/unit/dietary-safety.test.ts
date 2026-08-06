import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — .mjs script, no type declarations
import * as linter from "../../scripts/dietary-safety/lint.mjs";
// @ts-expect-error — .mjs script, no type declarations
import * as termLists from "../../scripts/dietary-safety/terms.mjs";

type Hit = {
  index: number;
  matched: string;
  label: string;
  rule: string;
  substitute: string | undefined;
};

type Finding = Hit & { file: string; location: string };

const { DEFAULT_GLOBS, collectFiles, formatFinding, lint, scanFile, scanText } = linter as {
  DEFAULT_GLOBS: string[];
  collectFiles: (root: string, globs: string[]) => string[];
  formatFinding: (finding: Finding) => string;
  lint: (
    root: string,
    globs?: string[]
  ) => { files: string[]; findings: Finding[]; unscanned: string[] };
  scanFile: (root: string, file: string) => Finding[];
  scanText: (text: string) => Hit[];
};

const { ALLOWLIST, FORBIDDEN_GLUTEN, FORBIDDEN_NUT, RULE_SETS } = termLists as {
  ALLOWLIST: RegExp[];
  FORBIDDEN_GLUTEN: { pattern: RegExp; label: string; substitute?: string }[];
  FORBIDDEN_NUT: { pattern: RegExp; label: string; substitute?: string }[];
  RULE_SETS: { rule: string; terms: { pattern: RegExp }[] }[];
};

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LINT_SCRIPT = path.join(REPO_ROOT, "scripts", "dietary-safety", "lint.mjs");

/** Temp dirs created during the run, removed afterAll. */
const tempDirs: string[] = [];
function makeTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dietary-safety-"));
  tempDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Run the CLI in `cwd`; returns exit code and combined output. */
function runCli(cwd: string, args: string[] = []): { code: number; output: string } {
  try {
    const stdout = execFileSync(process.execPath, [LINT_SCRIPT, ...args], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output: stdout };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("forbidden gluten terms (Rule 1) — every documented term is caught", () => {
  // One phrase per term/alias documented in docs/agents/dietary-safety.md.
  const glutenPhrases: [string, string][] = [
    ["wheat", "2 cups wheat"],
    ["whole wheat", "whole wheat pasta"],
    ["wheat berries", "cooked wheat berries"],
    ["wheat germ", "sprinkle of wheat germ"],
    ["wheat bran", "wheat bran muffins"],
    ["barley", "pearl barley soup"],
    ["rye", "rye crackers"],
    ["triticale", "triticale flakes"],
    ["spelt", "spelt flour"],
    ["farro", "farro salad"],
    ["einkorn", "einkorn berries"],
    ["emmer", "emmer flour"],
    ["kamut", "kamut pilaf"],
    ["durum", "durum pasta"],
    ["semolina", "semolina gnocchi"],
    ["couscous", "pearl couscous"],
    ["bulgur", "bulgur tabbouleh"],
    ["freekeh", "smoked freekeh"],
    ["malt", "a hint of malt"],
    ["malt extract", "malt extract in the marinade"],
    ["malt vinegar", "splash of malt vinegar"],
    ["malt syrup", "barley malt syrup"],
    ["malted", "malted milk powder"],
    ["malted barley", "malted barley base"],
    ["brewer's yeast", "1 tsp brewer's yeast"],
    ["beer", "deglaze with beer"],
    ["seitan", "grilled seitan strips"],
    ["soy sauce", "2 tbsp soy sauce"],
    ["regular oats", "use regular oats"],
    ["standard oats", "standard oats overnight"],
    ["oats", "top with oats"],
    ["oatmeal", "a bowl of oatmeal"],
  ];

  it.each(glutenPhrases)("catches %s", (_term, phrase) => {
    const hits = scanText(phrase);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.rule).toMatch(/gluten-free/);
  });
});

describe("forbidden cashew/pistachio terms (Rule 2) — every documented term is caught", () => {
  const nutPhrases: [string, string][] = [
    ["cashew", "a cashew garnish"],
    ["cashews", "roasted cashews"],
    ["cashew butter", "1 tbsp cashew butter"],
    ["cashew milk", "1 cup cashew milk"],
    ["cashew cream", "blend into cashew cream"],
    ["cashew cheese", "vegan cashew cheese"],
    ["cashew flour", "cashew flour crust"],
    ["pistachio", "pistachio garnish"],
    ["pistachios", "chopped pistachios"],
    ["pistachio paste", "swirl of pistachio paste"],
    ["pink peppercorn", "crushed pink peppercorn"],
    ["pink peppercorns", "garnish with pink peppercorns"],
    ["mixed nuts", "a handful of mixed nuts"],
    ["trail mix", "storebought trail mix"],
  ];

  it.each(nutPhrases)("catches %s", (_term, phrase) => {
    const hits = scanText(phrase);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.rule).toMatch(/cashews\/pistachios/);
  });

  it("reports the specific derived product once, not a duplicate generic hit", () => {
    const hits = scanText("cashew cream sauce");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.label).toMatch(/cashew cream/);
  });
});

describe("allowlist — known-safe phrases never trigger", () => {
  const safePhrases: [string, string][] = [
    ["buckwheat", "buckwheat groats with berries"],
    ["Buckwheat (capitalized)", "Buckwheat pancakes"],
    ["wheat-free", "this recipe is wheat-free"],
    ["gluten-free", "a gluten-free kitchen"],
    ["certified gluten-free oats", "use certified gluten-free oats"],
    ["certified GF oats", "certified GF oats for breakfast"],
    ["certified gluten-free oatmeal", "certified gluten-free oatmeal bake"],
  ];

  it.each(safePhrases)("does not flag %s", (_name, phrase) => {
    expect(scanText(phrase)).toEqual([]);
  });

  it("is word-boundary-aware: substrings inside other words never match", () => {
    // "ryegrass" contains "rye"; "goat" contains "oat"; "maltose" contains "malt".
    expect(scanText("ryegrass, goat cheese, and maltose-free candy")).toEqual([]);
  });

  it("still flags a forbidden term adjacent to an allowlisted phrase", () => {
    // The gluten-free claim does not sanitize the wheat next to it.
    const hits = scanText("gluten-free wheat bread");
    expect(hits.map((h) => h.matched.toLowerCase())).toContain("wheat");
  });

  it("flags uncertified oats even when 'gluten-free' appears elsewhere", () => {
    const hits = scanText("our gluten-free menu features overnight oats");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.label).toMatch(/oats/);
  });
});

describe("matching is case-insensitive", () => {
  it.each([["WHEAT"], ["Cashew"], ["PiStAcHiO"], ["SOY SAUCE"]])("catches %s", (phrase) => {
    expect(scanText(phrase).length).toBeGreaterThan(0);
  });
});

describe("term-list invariants", () => {
  it("every pattern is global and case-insensitive", () => {
    for (const { terms } of RULE_SETS) {
      for (const { pattern } of terms) {
        expect(pattern.flags).toContain("g");
        expect(pattern.flags).toContain("i");
      }
    }
    for (const pattern of ALLOWLIST) {
      expect(pattern.flags).toContain("g");
      expect(pattern.flags).toContain("i");
    }
  });

  it("every term has a label; substitutes exist for the key swap-outs", () => {
    for (const list of [FORBIDDEN_GLUTEN, FORBIDDEN_NUT]) {
      for (const term of list) {
        expect(term.label.length).toBeGreaterThan(0);
      }
    }
    const soySauce = FORBIDDEN_GLUTEN.find((t) => t.label.includes("soy sauce"));
    expect(soySauce?.substitute).toMatch(/tamari|coconut aminos/);
    const cashewCream = FORBIDDEN_NUT.find((t) => t.label.includes("cashew cream"));
    expect(cashewCream?.substitute).toMatch(/sunflower-seed cream/);
  });
});

describe("structured JSON scanning", () => {
  it("reports JSON paths for string values, including nested arrays", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "content"));
    fs.writeFileSync(
      path.join(root, "content", "week.json"),
      JSON.stringify({
        meals: [{ name: "Stir-fry", ingredients: ["broccoli", "soy sauce", "ginger"] }],
      })
    );
    const findings = scanFile(root, "content/week.json");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.location).toBe("$.meals[0].ingredients[1]");
    expect(findings[0]?.matched.toLowerCase()).toBe("soy sauce");
  });

  it("scans object keys too", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "content"));
    fs.writeFileSync(
      path.join(root, "content", "pantry.json"),
      JSON.stringify({ cashews: { amount: "1 cup" } })
    );
    const findings = scanFile(root, "content/pantry.json");
    expect(findings.some((f) => f.location.includes("(key)"))).toBe(true);
  });

  it("falls back to prose scanning for malformed JSON", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "content"));
    fs.writeFileSync(path.join(root, "content", "broken.json"), '{"a": "farro",');
    const findings = scanFile(root, "content/broken.json");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.location).toMatch(/^line \d+$/);
  });
});

describe("prose scanning", () => {
  it("reports 1-based line numbers for terms buried in recipe text", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "content"));
    fs.writeFileSync(
      path.join(root, "content", "recipe.md"),
      "# Stir-fry\n\nWhisk the sauce.\nAdd a splash of soy sauce and simmer.\n"
    );
    const findings = scanFile(root, "content/recipe.md");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.location).toBe("line 4");
  });
});

describe("fixture scanning", () => {
  it("default globs cover **/fixtures/** food-content fixtures", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "tests", "fixtures"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "tests", "fixtures", "meals.json"),
      JSON.stringify({ snack: "pistachio bar" })
    );
    const { files, findings } = lint(root);
    expect(files).toEqual(["tests/fixtures/meals.json"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.label).toMatch(/pistachio/);
  });
});

describe("no-content case", () => {
  it("lint() returns no files and no findings for an empty root", () => {
    const root = makeTempRoot();
    const { files, findings } = lint(root);
    expect(files).toEqual([]);
    expect(findings).toEqual([]);
  });

  it("CLI exits 0 with a clear note when there is nothing to scan", () => {
    const root = makeTempRoot();
    const { code, output } = runCli(root);
    expect(code).toBe(0);
    expect(output).toMatch(/no content found/i);
    expect(output).toMatch(/nothing to scan/i);
  });
});

describe("CLI failure output", () => {
  it("exits non-zero and reports file, location, term, rule, and substitute", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "content"));
    fs.writeFileSync(
      path.join(root, "content", "dinner.json"),
      JSON.stringify({ sauce: "cashew cream" })
    );
    const { code, output } = runCli(root);
    expect(code).toBe(1);
    expect(output).toContain("content/dinner.json");
    expect(output).toContain("$.sauce");
    expect(output).toContain("cashew cream");
    expect(output).toMatch(/Rule 2/);
    expect(output).toContain("sunflower-seed cream");
  });

  it("exits 0 on clean content", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "content"));
    fs.writeFileSync(
      path.join(root, "content", "lunch.json"),
      JSON.stringify({
        ingredients: ["quinoa", "salmon", "buckwheat", "certified gluten-free oats"],
      })
    );
    const { code, output } = runCli(root);
    expect(code).toBe(0);
    expect(output).toMatch(/no forbidden ingredients/i);
  });

  it("accepts custom globs as CLI arguments", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "seeds"));
    fs.writeFileSync(path.join(root, "seeds", "week1.md"), "Dinner: seitan skewers\n");
    const { code, output } = runCli(root, ["seeds/**/*.md"]);
    expect(code).toBe(1);
    expect(output).toContain("seeds/week1.md");
    expect(output).toContain("seitan");
  });
});

describe("formatFinding", () => {
  it("includes every field of the finding, with the substitute suggestion", () => {
    const line = formatFinding({
      file: "content/x.md",
      location: "line 2",
      matched: "soy sauce",
      label: "soy sauce (non-tamari; contains wheat)",
      rule: "Rule 1: 100% gluten-free",
      substitute: "certified-GF tamari or coconut aminos",
      index: 0,
    });
    expect(line).toContain("content/x.md");
    expect(line).toContain("line 2");
    expect(line).toContain("soy sauce");
    expect(line).toContain("Rule 1");
    expect(line).toContain("certified-GF tamari or coconut aminos");
  });
});

describe("whitespace-tolerant multi-word matching (review regression)", () => {
  it.each([
    ["soy sauce with double space", "soy  sauce"],
    ["soy sauce with tab", "soy\tsauce"],
    ["line-wrapped soy sauce", "stir in the soy\nsauce and simmer"],
    ["closed-compound soysauce", "add soysauce"],
    ["brewer's yeast with double space", "brewer's  yeast"],
    ["pink peppercorns with tab", "pink\tpeppercorns"],
    ["mixed nuts with double space", "mixed  nuts"],
    ["line-wrapped trail mix", "pack some trail\nmix"],
    ["line-wrapped cashew cream", "blend the cashew\ncream"],
  ])("catches %s", (_name, phrase) => {
    expect(scanText(phrase).length).toBeGreaterThan(0);
  });
});

describe("closed compounds and inflections (review regression)", () => {
  it.each([
    ["cashewnut", "cashewnut brittle"],
    ["cashewnuts", "a bag of cashewnuts"],
    ["wholewheat", "wholewheat rolls"],
    ["wheatberries", "cooked wheatberries"],
    ["wheatgerm", "sprinkle of wheatgerm"],
    ["wheatgrass", "wheatgrass shot"],
    ["wheaten", "wheaten loaf"],
    ["wheats", "ancient wheats"],
    ["oaten", "oaten biscuits"],
  ])("catches %s", (_name, phrase) => {
    expect(scanText(phrase).length).toBeGreaterThan(0);
  });

  it("still never flags buckwheat despite the expanded wheat matching", () => {
    expect(scanText("buckwheat groats, buckwheat flour, Buckwheat pancakes")).toEqual([]);
  });
});

describe("doc-listed terms added after review (baklava, korma, bare gluten)", () => {
  it("catches baklava (doc: baklava-style desserts)", () => {
    const hits = scanText("baklava bars for dessert");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.rule).toMatch(/cashews\/pistachios/);
  });

  it("catches korma with verify/adapt guidance", () => {
    const hits = scanText("chicken korma night");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.label).toMatch(/commonly cashew-thickened — verify\/adapt/);
    expect(hits[0]?.substitute).toMatch(/coconut cream|sunflower-seed butter/);
  });

  it('catches bare gluten ("add vital gluten")', () => {
    const hits = scanText("add vital gluten for structure");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.matched.toLowerCase()).toBe("gluten");
  });

  it("catches vital wheat gluten (both wheat and gluten hits)", () => {
    const matched = scanText("vital wheat gluten").map((h) => h.matched.toLowerCase());
    expect(matched).toContain("wheat");
    expect(matched).toContain("gluten");
  });

  it('still keeps "a gluten-free kitchen" clean', () => {
    expect(scanText("a gluten-free kitchen")).toEqual([]);
  });
});

describe("common wheat-product vocabulary (review regression)", () => {
  it.each([
    ["panko", "panko crust"],
    ["orzo", "orzo salad"],
    ["udon", "udon stir-fry"],
    ["ramen", "quick ramen bowl"],
    ["soba", "soba noodles"],
    ["graham", "graham cracker base"],
    ["farina", "warm farina"],
    ["phyllo", "phyllo cups"],
    ["filo", "filo pastry"],
    ["matzo", "matzo ball soup"],
    ["matzah", "matzah crackers"],
  ])("catches %s", (_name, phrase) => {
    const hits = scanText(phrase);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.rule).toMatch(/gluten-free/);
  });

  it("does not flag 100% buckwheat soba (the only safe soba phrasing)", () => {
    expect(scanText("100% buckwheat soba (certified GF)")).toEqual([]);
    expect(scanText("buckwheat soba noodles")).toEqual([]);
  });
});

describe("case-insensitive glob matching (review regression)", () => {
  it("scans content/Sneaky.JSON despite the uppercase extension", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "content"));
    fs.writeFileSync(path.join(root, "content", "Sneaky.JSON"), JSON.stringify({ s: "cashews" }));
    const { files, findings, unscanned } = lint(root);
    expect(files).toEqual(["content/Sneaky.JSON"]);
    expect(unscanned).toEqual([]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.label).toMatch(/cashew/);
    const { code, output } = runCli(root);
    expect(code).toBe(1);
    expect(output).toContain("Sneaky.JSON");
  });
});

describe("unscanned files under content/ hard-fail (review regression)", () => {
  it("lint() reports content files no glob covers", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "content"));
    fs.writeFileSync(path.join(root, "content", "notes.txt"), "secret cashew stash");
    const { files, unscanned } = lint(root);
    expect(files).toEqual([]);
    expect(unscanned).toEqual(["content/notes.txt"]);
  });

  it("CLI exits 1 and names the escaping file instead of claiming nothing to scan", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "content"));
    fs.writeFileSync(path.join(root, "content", "notes.txt"), "secret cashew stash");
    const { code, output } = runCli(root);
    expect(code).toBe(1);
    expect(output).toContain("content/notes.txt");
    expect(output).toMatch(/escape the scan globs/);
    expect(output).not.toMatch(/nothing to scan/);
  });
});

describe("symlinks are followed (review regression)", () => {
  it("scans a content/ symlink pointing outside the scan root", () => {
    const outside = makeTempRoot();
    fs.writeFileSync(path.join(outside, "evil.md"), "pistachio gelato\n");
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "content"));
    fs.symlinkSync(path.join(outside, "evil.md"), path.join(root, "content", "linked.md"));
    const { files, findings } = lint(root);
    expect(files).toEqual(["content/linked.md"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.label).toMatch(/pistachio/);
  });
});

describe("adjacent JSON string items are joined and scanned (review bonus)", () => {
  it('catches ["soy", "sauce"] split across array items', () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "content"));
    fs.writeFileSync(
      path.join(root, "content", "split.json"),
      JSON.stringify({ steps: ["soy", "sauce"] })
    );
    const findings = scanFile(root, "content/split.json");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.location).toBe("$.steps[0..1] (adjacent strings)");
    expect(findings[0]?.matched.toLowerCase()).toBe("soy sauce");
  });

  it("does not duplicate hits already contained in a single item", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "content"));
    fs.writeFileSync(
      path.join(root, "content", "single.json"),
      JSON.stringify({ steps: ["add farro", "then rest"] })
    );
    const findings = scanFile(root, "content/single.json");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.location).toBe("$.steps[0]");
  });
});

describe("reviewer's combined attack fixture", () => {
  it("fails with hits for every planted term", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "content"));
    fs.writeFileSync(
      path.join(root, "content", "attack.md"),
      [
        "# Snack ideas",
        "baklava bars",
        "cashewnut brittle",
        "wholewheat rolls",
        "soy  sauce glaze",
        "drizzle of soy",
        "sauce from the wok", // line-wrapped "soy\nsauce" across these two lines
        "wheaten crackers with wheatgerm and a wheatgrass shot",
      ].join("\n")
    );
    fs.writeFileSync(path.join(root, "content", "Sneaky.JSON"), JSON.stringify({ s: "cashews" }));
    const { code, output } = runCli(root);
    expect(code).toBe(1);
    for (const planted of [
      "baklava",
      "cashewnut",
      "wholewheat",
      "soy  sauce",
      "wheaten",
      "wheatgerm",
      "wheatgrass",
      "Sneaky.JSON",
      "cashews",
    ]) {
      expect(output).toContain(planted);
    }
    expect(output).not.toMatch(/no forbidden ingredients/);
  });
});

describe("file collection", () => {
  it("ignores node_modules and dot-directories", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "node_modules", "pkg", "fixtures"), { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules", "pkg", "fixtures", "x.json"), '"wheat"');
    fs.mkdirSync(path.join(root, ".hidden", "fixtures"), { recursive: true });
    fs.writeFileSync(path.join(root, ".hidden", "fixtures", "y.json"), '"wheat"');
    expect(collectFiles(root, DEFAULT_GLOBS)).toEqual([]);
  });
});
