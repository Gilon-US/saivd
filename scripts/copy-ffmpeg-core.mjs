#!/usr/bin/env node
/**
 * Copy @ffmpeg/core single-thread assets into public/ffmpeg for same-origin loading in the verify worker.
 * Run after upgrading @ffmpeg/core: node scripts/copy-ffmpeg-core.mjs
 */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcDir = join(root, "node_modules", "@ffmpeg", "core", "dist", "esm");
const destDir = join(root, "public", "ffmpeg");

await mkdir(destDir, {recursive: true});
await copyFile(join(srcDir, "ffmpeg-core.js"), join(destDir, "ffmpeg-core.js"));
await copyFile(join(srcDir, "ffmpeg-core.wasm"), join(destDir, "ffmpeg-core.wasm"));
console.log("Copied ffmpeg-core.js and ffmpeg-core.wasm to public/ffmpeg/");
