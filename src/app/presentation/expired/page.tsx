import {ShieldAlert} from "lucide-react";
import {getUnauthenticatedMediaPageCopy} from "@/lib/unauthenticated-media-copy";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const copy = await getUnauthenticatedMediaPageCopy();
  return {
    title: `${copy.headline} | SAIVD`,
    robots: {index: false, follow: false},
  };
}

export default async function PresentationExpiredPage() {
  const copy = await getUnauthenticatedMediaPageCopy();

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="max-w-md w-full rounded-xl border bg-white p-8 shadow-sm text-center">
        <div className="flex justify-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/saivd-logo.png"
            alt="SAIVD"
            className="h-10 w-auto object-contain"
          />
        </div>

        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-amber-300 bg-amber-50">
          <ShieldAlert className="h-8 w-8 text-amber-700" aria-hidden />
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 mb-2">{copy.headline}</h1>
        {copy.subhead ? (
          <p className="text-base font-medium text-gray-800 mb-4">{copy.subhead}</p>
        ) : null}
        <p className="text-gray-600 mb-8 whitespace-pre-line">{copy.body}</p>

        <a
          href={copy.ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors">
          {copy.ctaLabel}
        </a>

        {copy.tagline ? (
          <p className="mt-6 text-xs tracking-wide text-gray-400 uppercase">{copy.tagline}</p>
        ) : null}
      </div>
    </main>
  );
}
