#!/usr/bin/env node
/**
 * Local E2E: upload → confirm → normalize → watermark → completion email.
 * Requires: Next on :3000, manager on :8080, Redis, ffmpeg, .env.local
 */
import {createClient} from "@supabase/supabase-js";
import {spawnSync} from "node:child_process";
import {readFileSync, unlinkSync, existsSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createInterface} from "node:readline";

function loadEnv(path) {
  const vals = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    let v = trimmed.slice(i + 1);
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    vals[trimmed.slice(0, i)] = v;
  }
  return vals;
}

function log(step, detail = "") {
  console.log(`[e2e] ${step}${detail ? ` — ${detail}` : ""}`);
}

function fail(msg) {
  console.error(`[e2e] FAIL: ${msg}`);
  process.exit(1);
}

async function waitForLog(pattern, timeoutMs, logFile) {
  const deadline = Date.now() + timeoutMs;
  let offset = existsSync(logFile) ? readFileSync(logFile, "utf8").length : 0;
  while (Date.now() < deadline) {
    if (existsSync(logFile)) {
      const text = readFileSync(logFile, "utf8").slice(offset);
      if (pattern.test(text)) return text.match(pattern)?.[0] ?? "matched";
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

async function main() {
  const env = loadEnv(new URL("../.env.local", import.meta.url).pathname);
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    fail("Missing Supabase env in .env.local");
  }

  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const base = "http://127.0.0.1:3000";
  const email = "elon@saivd.io";

  // Health checks
  for (const [name, url] of [
    ["next", `${base}/login`],
    ["manager", "http://127.0.0.1:8080/docs"],
  ]) {
    const res = await fetch(url);
    if (!res.ok && res.status !== 404) fail(`${name} not healthy: ${res.status}`);
    log("health", `${name} ok`);
  }

  // Tiny synthetic MP4 (~2s)
  const videoPath = join(tmpdir(), `saivd-e2e-${Date.now()}.mp4`);
  const ff = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x240:d=2",
      "-f",
      "lavfi",
      "-i",
      "sine=f=440:d=2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      videoPath,
    ],
    {encoding: "utf8"},
  );
  if (ff.status !== 0) fail(`ffmpeg failed: ${ff.stderr?.slice(-400)}`);
  const fileBuf = readFileSync(videoPath);
  const filename = `e2e-email-check-${Date.now()}.mp4`;
  const contentType = "video/mp4";
  log("fixture", `${filename} (${fileBuf.length} bytes)`);

  // Auth as elon@saivd.io via magic link OTP (service role)
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: {autoRefreshToken: false, persistSession: false},
  });
  const {data: linkData, error: linkErr} = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    fail(`generateLink failed: ${linkErr?.message ?? "no hashed_token"}`);
  }

  const anon = createClient(supabaseUrl, anonKey, {
    auth: {autoRefreshToken: false, persistSession: false},
  });
  const {data: otpData, error: otpErr} = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });
  if (otpErr || !otpData.session) fail(`verifyOtp failed: ${otpErr?.message}`);
  const session = otpData.session;
  log("auth", `signed in as ${email}`);

  const cookieValue = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    }),
  );
  const cookieHeader = `${cookieName}=${cookieValue}`;

  const authed = (path, init = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Cookie: cookieHeader,
      },
    });

  // 1) Presign
  const uploadRes = await authed("/api/videos/upload", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({filename, contentType, filesize: fileBuf.length}),
  });
  const uploadJson = await uploadRes.json();
  if (!uploadRes.ok || !uploadJson.success) {
    fail(`upload URL: ${uploadRes.status} ${JSON.stringify(uploadJson)}`);
  }
  const {uploadUrl, fields, key} = uploadJson.data;
  log("upload-url", key);

  // 2) Wasabi POST
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", new Blob([fileBuf], {type: contentType}), filename);
  const wasabiRes = await fetch(uploadUrl, {method: "POST", body: form});
  if (!wasabiRes.ok) fail(`wasabi upload: ${wasabiRes.status} ${await wasabiRes.text()}`);
  log("wasabi", "uploaded");

  // 3) Confirm
  const confirmRes = await authed("/api/videos/confirm", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      key,
      filename,
      filesize: fileBuf.length,
      contentType,
      sourceDisplayAspect: 320 / 240,
    }),
  });
  const confirmJson = await confirmRes.json();
  if (!confirmRes.ok || !confirmJson.success) {
    fail(`confirm: ${confirmRes.status} ${JSON.stringify(confirmJson)}`);
  }
  const videoId = confirmJson.data.id;
  log("confirm", videoId);

  // 4) Normalize (triggers watermark on callback)
  const normRes = await authed(`/api/videos/${videoId}/normalize`, {method: "POST"});
  const normJson = await normRes.json().catch(() => ({}));
  if (!normRes.ok) fail(`normalize: ${normRes.status} ${JSON.stringify(normJson)}`);
  log("normalize", "accepted");

  // 5) Poll DB via API until processed
  const pollDeadline = Date.now() + 10 * 60 * 1000;
  let status = "uploaded";
  while (Date.now() < pollDeadline) {
    const listRes = await authed("/api/videos?page=1&limit=20&sortBy=upload_date&sortOrder=desc");
    const listJson = await listRes.json();
    const video = (listJson.data?.videos ?? listJson.data ?? []).find?.((v) => v.id === videoId)
      ?? (Array.isArray(listJson.data) ? listJson.data.find((v) => v.id === videoId) : null);

    // Fallback shape
    let found = video;
    if (!found && listJson.success) {
      const videos = listJson.data?.items || listJson.data?.results || listJson.data?.videos || [];
      found = videos.find((v) => v.id === videoId);
    }

    if (found) {
      status = found.status;
      log(
        "poll",
        `status=${found.status} normalize=${found.normalization_status ?? "?"} processed=${Boolean(found.processed_url)}`,
      );
      if (found.status === "processed" && found.processed_url) break;
      if (found.status === "failed") fail("video status failed");
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (status !== "processed") fail(`timed out waiting for processed (last=${status})`);

  // 6) Confirm email success in Next server log
  const logFile =
    process.env.E2E_NEXT_LOG ||
    "/Users/elonkaplan/.cursor/projects/Users-elonkaplan-Desktop-my-repos-SAIVD-Code-saivd/terminals/26544.txt";
  // Only consider log lines after this run started (avoid stale 535 noise).
  const marker = filename;
  const deadline = Date.now() + 120000;
  let emailOk = false;
  let emailFail = false;
  let emailHost = null;
  while (Date.now() < deadline) {
    if (existsSync(logFile)) {
      const text = readFileSync(logFile, "utf8");
      const idx = text.lastIndexOf(marker);
      if (idx >= 0) {
        const window = text.slice(Math.max(0, idx - 500), idx + 1200);
        if (/Email sent successfully/.test(window)) emailOk = true;
        if (/Error sending email/.test(window) || /535 Authentication/.test(window)) emailFail = true;
        const hostMatch = window.match(/host: '([^']+)'/);
        if (hostMatch) emailHost = hostMatch[1];
      }
    }
    if (emailOk || emailFail) break;
    await new Promise((r) => setTimeout(r, 1500));
  }

  log("email-host", emailHost ?? "(not found in logs)");
  if (emailFail && !emailOk) {
    fail(`email still failing (host=${emailHost ?? "?"})`);
  }
  if (!emailOk) fail("email success log not found for this upload");
  log("email", "sent successfully");

  try {
    unlinkSync(videoPath);
  } catch {
    /* ignore */
  }

  console.log("\n[e2e] PASS — upload → normalize → watermark → processed (+ email path verified)\n");
  console.log(
    JSON.stringify(
      {
        videoId,
        filename,
        key,
        status: "processed",
        email: emailOk ? "sent" : "smtp_ok_await_webhook_log",
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
