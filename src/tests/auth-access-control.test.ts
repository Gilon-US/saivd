import { test, expect } from '@playwright/test';

/**
 * Tests for authentication-based access control
 * 
 * These tests verify that:
 * 1. Unauthenticated users are redirected to login
 * 2. Authenticated users are directed to the dashboard
 * 3. Upload functionality is only available to authenticated users
 */

test.describe('Authentication Access Control', () => {
  test('unauthenticated user is redirected to login from root', async ({ page }) => {
    await page.goto('/');
    // Should be redirected to login
    await expect(page).toHaveURL(/.*\/login/);
    // Login page should be visible
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  });

  test('unauthenticated user is redirected to login from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    // Should be redirected to login with redirectTo parameter
    await expect(page).toHaveURL(/.*\/login\?redirectTo=%2Fdashboard/);
  });

  test('unauthenticated user is redirected to login from videos page', async ({ page }) => {
    await page.goto('/dashboard/videos');
    // Should be redirected to login with redirectTo parameter
    await expect(page).toHaveURL(/.*\/login\?redirectTo=%2Fdashboard%2Fvideos/);
  });

  test('unauthenticated user cannot access upload API', async ({ request }) => {
    const response = await request.post('/api/videos/upload', {
      data: {
        filename: 'test.mp4',
        contentType: 'video/mp4',
        filesize: 1024
      }
    });
    
    expect(response.status()).toBe(401);
    
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('unauthorized');
  });

  test('authenticated user is redirected to dashboard from root', async ({ browser }) => {
    // Create a new context with storage state that includes authentication
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [{
        origin: 'http://localhost:3000',
        localStorage: [{
          name: 'supabase.auth.token',
          value: JSON.stringify({ 
            access_token: 'test-token',
            refresh_token: 'test-refresh-token',
            expires_at: Date.now() + 3600000
          })
        }]
      }] }
    });
    
    const page = await context.newPage();
    await page.goto('/');
    
    // Should be redirected to dashboard/videos
    await expect(page).toHaveURL(/.*\/dashboard\/videos/);
    
    await context.close();
  });

  test('authenticated user is redirected to dashboard from login page', async ({ browser }) => {
    // Create a new context with storage state that includes authentication
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [{
        origin: 'http://localhost:3000',
        localStorage: [{
          name: 'supabase.auth.token',
          value: JSON.stringify({ 
            access_token: 'test-token',
            refresh_token: 'test-refresh-token',
            expires_at: Date.now() + 3600000
          })
        }]
      }] }
    });
    
    const page = await context.newPage();
    await page.goto('/login');
    
    // Should be redirected to dashboard/videos
    await expect(page).toHaveURL(/.*\/dashboard\/videos/);
    
    await context.close();
  });
});
