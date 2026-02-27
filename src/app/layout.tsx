import type {Metadata} from "next";
import {Geist, Geist_Mono} from "next/font/google";
import {Toaster} from "@/components/ui/sonner";
import {AuthProvider} from "@/contexts/AuthContext";
import packageJson from "../../package.json";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SAIVD App",
  description: "Upload your files to Wasabi Cloud Storage",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased flex min-h-screen flex-col`} suppressHydrationWarning={true}>
        <AuthProvider>
          <main className="flex-1">{children}</main>
          <Toaster />
          <footer className="mt-auto py-2 text-center text-xs text-muted-foreground" role="contentinfo">
            v{packageJson.version}
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
