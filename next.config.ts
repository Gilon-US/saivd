import type { NextConfig } from "next";
import path from "node:path";

/**
 * Use standalone output only when explicitly requested (e.g. Docker/self-hosted).
 * Netlify does not support output: 'standalone' and will fail to serve pages correctly
 * (e.g. "Page Not Found"). Netlify uses its own Next.js runtime; leave output unset there.
 */
const strictModeDisabledForSession = process.env.NEXT_DISABLE_STRICT_MODE === "1";

const nextConfig: NextConfig = {
  ...(process.env.USE_STANDALONE_OUTPUT === "true" ? { output: "standalone" as const } : {}),
  // Safe local override: callback dev launcher can disable Strict Mode for this process only.
  reactStrictMode: !strictModeDisabledForSession,
  /** Needed for watermark verify worker deps (mp4box, @ffmpeg/ffmpeg) in client bundles */
  transpilePackages: ["@ffmpeg/ffmpeg", "@ffmpeg/util", "mp4box"],
  experimental: {
    // Add any experimental features here
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...config.resolve.alias,
        // Used by `src/lib/ffmpeg-inner-worker.ts` (same as tsconfig paths)
        "@ffmpeg/ffmpeg-esm": path.join(process.cwd(), "node_modules/@ffmpeg/ffmpeg/dist/esm"),
      };
      config.output = config.output ?? {};
      config.output.workerPublicPath = "/_next/";
      // @ffmpeg/ffmpeg inner worker uses import(coreURL); Webpack must not treat
      // same-origin https: URLs as chunk IDs. Replace with patched worker (webpackIgnore).
      config.plugins = config.plugins ?? [];
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /@ffmpeg[\\/]ffmpeg[\\/]dist[\\/]esm[\\/]worker\.js$/,
          path.resolve(process.cwd(), "src/lib/ffmpeg-inner-worker.ts")
        )
      );
    }
    return config;
  },
};

export default nextConfig;
