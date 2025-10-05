import {Metadata} from "next";
import {ReactNode} from "react";

export const metadata: Metadata = {
  title: "My Videos | SAIVD",
  description: "View and manage your videos",
};

export default function VideosLayout({children}: {children: ReactNode}) {
  return <>{children}</>;
}
