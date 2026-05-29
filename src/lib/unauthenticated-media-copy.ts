import {getSetting} from "@/lib/app-settings";

export type UnauthenticatedMediaPageCopy = {
  headline: string;
  subhead: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  tagline: string;
};

/** Load admin-managed copy for /presentation/expired with code fallbacks. */
export async function getUnauthenticatedMediaPageCopy(): Promise<UnauthenticatedMediaPageCopy> {
  const [headline, subhead, body, ctaLabel, ctaUrl, tagline] = await Promise.all([
    getSetting("unauthenticated_media_headline"),
    getSetting("unauthenticated_media_subhead"),
    getSetting("unauthenticated_media_body"),
    getSetting("unauthenticated_media_cta_label"),
    getSetting("unauthenticated_media_cta_url"),
    getSetting("unauthenticated_media_tagline"),
  ]);

  return {headline, subhead, body, ctaLabel, ctaUrl, tagline};
}
