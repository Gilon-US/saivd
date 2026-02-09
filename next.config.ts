import type { NextConfig } from "next";

/**
 * Use standalone output only when explicitly requested (e.g. Docker/self-hosted).
 * Netlify does not support output: 'standalone' and will fail to serve pages correctly
 * (e.g. "Page Not Found"). Netlify uses its own Next.js runtime; leave output unset there.
 */
const nextConfig: NextConfig = {
  ...(process.env.USE_STANDALONE_OUTPUT === "true" ? { output: "standalone" as const } : {}),
  experimental: {
    // Add any experimental features here
  },
};

export default nextConfig;
