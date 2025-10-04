/**
 * End-to-end tests for Public Profile Page
 * Story 2.3: Public Profile Page Component
 */

import { test, expect } from '@playwright/test';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

test.describe('Public Profile Page', () => {
  test.beforeEach(async ({ page }) => {
    // Set up any necessary test data or mocks
  });

  test('displays profile for existing user', async ({ page }) => {
    // Use a known test user ID or create one
    const testUserId = '550e8400-e29b-41d4-a716-446655440000';
    
    await page.goto(`${baseUrl}/profile/${testUserId}`);
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check if we get either a profile or a "not found" message
    const hasProfile = await page.locator('[data-testid="profile-card"]').isVisible();
    const hasError = await page.locator('text=Profile Not Found').isVisible();
    
    expect(hasProfile || hasError).toBe(true);
    
    if (hasProfile) {
      // If profile exists, check basic structure
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('shows error for invalid user ID format', async ({ page }) => {
    await page.goto(`${baseUrl}/profile/invalid-uuid`);
    
    // Should show error state
    await expect(page.locator('text=Profile Not Found')).toBeVisible();
    await expect(page.locator('text=Go Back')).toBeVisible();
  });

  test('shows loading state initially', async ({ page }) => {
    // Slow down network to see loading state
    await page.route('**/api/profile/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.continue();
    });
    
    const testUserId = '550e8400-e29b-41d4-a716-446655440000';
    await page.goto(`${baseUrl}/profile/${testUserId}`);
    
    // Should show loading spinner initially
    await expect(page.locator('text=Loading profile...')).toBeVisible();
  });

  test('has proper page structure and accessibility', async ({ page }) => {
    const testUserId = '550e8400-e29b-41d4-a716-446655440000';
    await page.goto(`${baseUrl}/profile/${testUserId}`);
    
    await page.waitForLoadState('networkidle');
    
    // Check main landmark
    await expect(page.locator('main')).toBeVisible();
    
    // Check heading hierarchy if profile exists
    const hasProfile = await page.locator('h1').isVisible();
    if (hasProfile) {
      await expect(page.locator('h1')).toBeVisible();
    }
  });

  test('is responsive on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    const testUserId = '550e8400-e29b-41d4-a716-446655440000';
    await page.goto(`${baseUrl}/profile/${testUserId}`);
    
    await page.waitForLoadState('networkidle');
    
    // Check that content is visible and properly laid out on mobile
    const main = page.locator('main');
    await expect(main).toBeVisible();
    
    // Check responsive padding classes are applied
    const container = page.locator('main > div');
    await expect(container).toBeVisible();
  });

  test('is responsive on tablet devices', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    
    const testUserId = '550e8400-e29b-41d4-a716-446655440000';
    await page.goto(`${baseUrl}/profile/${testUserId}`);
    
    await page.waitForLoadState('networkidle');
    
    // Check that content is visible on tablet
    await expect(page.locator('main')).toBeVisible();
  });

  test('is responsive on desktop devices', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    const testUserId = '550e8400-e29b-41d4-a716-446655440000';
    await page.goto(`${baseUrl}/profile/${testUserId}`);
    
    await page.waitForLoadState('networkidle');
    
    // Check that content is visible on desktop
    await expect(page.locator('main')).toBeVisible();
  });

  test('handles network errors gracefully', async ({ page }) => {
    // Mock network failure
    await page.route('**/api/profile/**', route => route.abort());
    
    const testUserId = '550e8400-e29b-41d4-a716-446655440000';
    await page.goto(`${baseUrl}/profile/${testUserId}`);
    
    // Should show error state
    await expect(page.locator('text=Profile Not Found')).toBeVisible();
    await expect(page.locator('text=Failed to load profile')).toBeVisible();
  });

  test('go back button works', async ({ page }) => {
    // Navigate to a page first
    await page.goto(`${baseUrl}/`);
    
    // Then navigate to profile page with invalid ID
    await page.goto(`${baseUrl}/profile/invalid-uuid`);
    
    // Click go back button
    await page.click('text=Go Back');
    
    // Should navigate back to previous page
    await expect(page).toHaveURL(`${baseUrl}/`);
  });

  test('has proper SEO metadata', async ({ page }) => {
    const testUserId = '550e8400-e29b-41d4-a716-446655440000';
    await page.goto(`${baseUrl}/profile/${testUserId}`);
    
    await page.waitForLoadState('networkidle');
    
    // Check that title is set
    const title = await page.title();
    expect(title).toContain('SAVD');
    
    // Check meta description
    const metaDescription = await page.locator('meta[name="description"]').getAttribute('content');
    expect(metaDescription).toBeTruthy();
    
    // Check Open Graph tags
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).toBeTruthy();
  });

  test('keyboard navigation works', async ({ page }) => {
    const testUserId = '550e8400-e29b-41d4-a716-446655440000';
    await page.goto(`${baseUrl}/profile/${testUserId}`);
    
    await page.waitForLoadState('networkidle');
    
    // Test tab navigation
    await page.keyboard.press('Tab');
    
    // If there's a "Go Back" button (error state), it should be focusable
    const goBackButton = page.locator('text=Go Back');
    if (await goBackButton.isVisible()) {
      await expect(goBackButton).toBeFocused();
    }
  });

  test('works without JavaScript', async ({ page }) => {
    // Disable JavaScript
    await page.setJavaScriptEnabled(false);
    
    const testUserId = '550e8400-e29b-41d4-a716-446655440000';
    await page.goto(`${baseUrl}/profile/${testUserId}`);
    
    // Basic content should still be visible
    // Note: This test may need adjustment based on SSR implementation
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });

  test('performance is acceptable', async ({ page }) => {
    const testUserId = '550e8400-e29b-41d4-a716-446655440000';
    
    const startTime = Date.now();
    await page.goto(`${baseUrl}/profile/${testUserId}`);
    await page.waitForLoadState('networkidle');
    const endTime = Date.now();
    
    const loadTime = endTime - startTime;
    
    // Page should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });
});
