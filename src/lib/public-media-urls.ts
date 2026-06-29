export type PublicMediaKind = "video" | "image";

const DEFAULT_CREATOR_ORIGIN = "https://creator.saivd.io";
const DEFAULT_VIEWER_ORIGIN = "https://viewer.saivd.io";

/** Creator app origin for public watch/embed links and QR (env, then browser origin). */
export function getCreatorAppPublicOrigin(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.PUBLIC_APP_URL;

  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return DEFAULT_CREATOR_ORIGIN;
}

/** Viewer app origin (claim links and viewer-library shares only). */
export function getViewerOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SAIVD_VIEWER_URL;
  return (fromEnv ?? DEFAULT_VIEWER_ORIGIN).replace(/\/+$/, "");
}

export function getPublicWatchUrl(kind: PublicMediaKind, mediaId: string): string {
  const origin = getCreatorAppPublicOrigin();
  const path = kind === "image" ? `/i/${mediaId}` : `/v/${mediaId}`;
  return `${origin}${path}`;
}

export function getPublicEmbedUrl(kind: PublicMediaKind, mediaId: string): string {
  const origin = getCreatorAppPublicOrigin();
  const path = kind === "image" ? `/embed/i/${mediaId}` : `/embed/${mediaId}`;
  return `${origin}${path}`;
}

/** Universal iframe embed snippet for third-party sites. */
export function getPublicEmbedSnippet(kind: PublicMediaKind, mediaId: string): string {
  const embedUrl = getPublicEmbedUrl(kind, mediaId);

  if (kind === "image") {
    return (
      `<div style="width:100%;max-width:100%;margin:0 auto;">\n` +
      `  <iframe src="${embedUrl}"\n` +
      `          style="width:100%;aspect-ratio:1/1;border:0;display:block;"\n` +
      `          loading="lazy"\n` +
      `          referrerpolicy="strict-origin-when-cross-origin"\n` +
      `          title="SAIVD verified image"></iframe>\n` +
      `</div>`
    );
  }

  return (
    `<div style="width:100%;max-width:100%;margin:0 auto;">\n` +
    `  <iframe src="${embedUrl}"\n` +
    `          style="width:100%;aspect-ratio:16/9;border:0;display:block;"\n` +
    `          allow="autoplay; fullscreen; picture-in-picture"\n` +
    `          allowfullscreen loading="lazy"\n` +
    `          referrerpolicy="strict-origin-when-cross-origin"\n` +
    `          title="SAIVD verified video"></iframe>\n` +
    `</div>`
  );
}

export function getViewerClaimUrl(token: string): string {
  return `${getViewerOrigin()}/claim/${token}`;
}
