import { expect, test } from "@playwright/test";

// The repo has no `content/` directory yet, so the home page renders its
// empty state. When the first week is published, this spec must be updated
// alongside it (assert the week digest instead of the empty state).

test("home page renders the empty state with site chrome", async ({ page }) => {
  await page.goto("/");

  // Empty state: friendly, explicit, server-rendered via the route loader —
  // this proves SSR + the loader + the content server function end-to-end.
  await expect(
    page.getByRole("heading", { level: 1, name: "No weeks published yet" })
  ).toBeVisible();

  // Site chrome: nav to the archive…
  await expect(page.getByRole("navigation", { name: "Site" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Archive" })).toBeVisible();

  // …and the footer disclaimer, verbatim.
  await expect(
    page.getByText(
      "This site documents one household's meal plan. It is not medical or nutritional advice."
    )
  ).toBeVisible();
});

test("archive page renders its empty state", async ({ page }) => {
  await page.goto("/weeks");
  await expect(
    page.getByRole("heading", { level: 1, name: "No weeks in the archive yet" })
  ).toBeVisible();
});

test("unknown week renders the not-found page with a real 404 status", async ({ page }) => {
  // A well-formed identifier (a real Sunday) that simply isn't published.
  const response = await page.goto("/week/2026-05-17");
  // Assert the HTTP status too — a regression to 200-with-not-found-UI must
  // not pass e2e (search engines and caches care about the status line).
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Week not found" })).toBeVisible();
});

test("a non-Sunday week URL is a 404, not a crash", async ({ page }) => {
  // 2026-05-18 is a Monday: the route rejects it before any content lookup,
  // so a mistyped or hand-edited URL degrades to the same not-found page
  // rather than a 500 from weekStartDate throwing.
  const response = await page.goto("/week/2026-05-18");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Week not found" })).toBeVisible();
});
