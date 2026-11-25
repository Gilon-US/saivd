/**
 * Download buttons in the video/image grids are hidden in production (commit d2e2b5f) and shown only for
 * debugging: on Netlify deploy previews / branch deploys (set at build time in next.config.ts from Netlify's
 * CONTEXT), or when NEXT_PUBLIC_ENABLE_DOWNLOADS=true is set explicitly (e.g. locally).
 */
export const DOWNLOAD_BUTTONS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DOWNLOADS === "true";
