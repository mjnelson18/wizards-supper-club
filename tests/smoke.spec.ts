import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Every page, at 360 px wide. Routes use IDs present in both the real Sheet and
// the sample data.
const ROUTES: [string, RegExp][] = [
  ['/', /Council chamber/],
  ['/circuits', /Circuits/],
  ['/circuits/7', /7th circuit/],
  ['/circuits/compare?a=7&b=8', /Compare circuits/],
  ['/restaurants', /Hall of fame/],
  ['/evenings/C8-01', /.+/],
  ['/wizards', /Wizards/],
  ['/wizards/Thomas', /Tom/],
  ['/wizards/head-to-head?a=Calum&b=Michael', /Head-to-head/],
  ['/trends', /Trends/],
  ['/records', /Records/],
  ['/methods', /How the numbers/],
];

async function open(page: Page, route: string) {
  await page.goto(`/#${route}`);
  await expect(page.locator('h1')).toBeVisible();
}

for (const [route, heading] of ROUTES) {
  test(`${route} renders, fits 360 px and passes accessibility checks`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await open(page, route);
    await expect(page.locator('h1')).toHaveText(heading);

    // Nothing but the heatmap may scroll sideways, and it scrolls in its own frame.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);

    // Every page: refresh time and a link to Methods.
    await expect(page.locator('footer')).toContainText('Data last refreshed');
    await expect(page.locator('footer a[href="#/methods"]')).toBeVisible();

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.html}`)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('light theme passes accessibility checks on the busiest pages', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wsc-theme', 'light'));
  for (const route of ['/', '/circuits/7', '/trends']) {
    await open(page, route);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations.map((v) => `${route} ${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  }
});

test('the heatmap scrolls inside its own frame', async ({ page }) => {
  await open(page, '/circuits/7');
  const frame = page.getByRole('region', { name: /Scores by wizard and evening/ });
  await expect(frame).toBeVisible();
  const { inner, outer } = await frame.evaluate((el) => ({ inner: el.scrollWidth, outer: el.clientWidth }));
  expect(inner).toBeGreaterThan(outer);
});

test('the bottom navigation reaches every section', async ({ page }) => {
  await open(page, '/');
  for (const [label, heading] of [
    ['Circuits', /Circuits/],
    ['Restaurants', /Hall of fame/],
    ['Wizards', /Wizards/],
    ['Trends', /Trends/],
    ['Records', /Records/],
    ['Home', /Council chamber/],
  ] as const) {
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: label }).click();
    await expect(page.locator('h1')).toHaveText(heading);
  }
});

test('search finds a restaurant and opens its evening', async ({ page }) => {
  await open(page, '/restaurants');
  const first = await page.locator('main ol a').first().innerText();
  await page.getByLabel('Search restaurants').fill(first.slice(0, 6));
  await page.getByRole('link', { name: first }).first().click();
  await expect(page.locator('h1')).toHaveText(first);
  await expect(page.getByText('Evening average')).toBeVisible();
});

test('no private content reaches the page or its data files', async ({ page, request }) => {
  await open(page, '/');
  for (const file of ['stats.json', 'evenings.json', 'scores.json', 'meta.json']) {
    const body = await (await request.get(`/data/${file}`)).text();
    expect(body, file).not.toMatch(/@|https?:|forms\.gle|docs\.google|Review/);
  }
});
