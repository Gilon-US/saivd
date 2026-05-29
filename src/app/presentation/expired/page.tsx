import Link from "next/link";

export const metadata = {
  title: "Presentation expired | SAIVD",
  robots: {index: false, follow: false},
};

export default function PresentationExpiredPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full rounded-lg border bg-white p-8 shadow text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Presentation expired</h1>
        <p className="text-gray-600 mb-6">
          This QR code is no longer valid for an authenticated presentation scan. The content may have been
          photographed or shared after the allowed presentation window, which SAIVD treats as unauthenticated use.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          Go to SAIVD
        </Link>
      </div>
    </main>
  );
}
