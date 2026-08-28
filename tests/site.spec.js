import { test, expect } from '@playwright/test';

test.describe('Public project site', () => {
  test('landing page explains the project and links to the gated game', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Build a civilization/i })).toBeVisible();
    await expect(page.getByText(/must own Civilization II MGE/i)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open the game' })).toHaveAttribute('href', './game.html');
  });

  test('game does not load MGE assets before ownership attestation', async ({ page }) => {
    const assetRequests = [];
    page.on('request', request => {
      if (/\/(sprites|Music|Sound|PEDIA)\//.test(request.url())) assetRequests.push(request.url());
    });

    await page.goto('/game.html');
    await expect(page.getByRole('heading', { name: /Confirm that you own/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Accept and open game/i })).toBeDisabled();
    expect(await page.evaluate(() => window.__civ2)).toBeUndefined();
    expect(assetRequests).toEqual([]);
  });

  test('acceptance is required, stored locally, and opens the game', async ({ page }) => {
    await page.goto('/game.html');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /Accept and open game/i }).click();

    await page.waitForFunction(() => window.__civ2?.mapScreen);
    await expect(page.locator('#ownership-gate')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('civ2_mge_ownership_terms_v1'))).toBe('accepted');

    await page.reload();
    await page.waitForFunction(() => window.__civ2?.mapScreen);
    await expect(page.locator('#ownership-gate')).toBeHidden();

    await page.goto('/game.html?terms=1');
    await expect(page.getByRole('heading', { name: /Confirm that you own/i })).toBeVisible();
  });
});
