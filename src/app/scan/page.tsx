import {redirect} from "next/navigation";
import {isPresentationQrEnabled} from "@/lib/presentation-qr/constants";
import {verifyPresentationToken} from "@/lib/presentation-qr/token";

type ScanPageProps = {
  searchParams: Promise<{token?: string}>;
};

export default async function ScanPage({searchParams}: ScanPageProps) {
  if (!isPresentationQrEnabled()) {
    redirect("/presentation/expired");
  }

  const {token} = await searchParams;
  if (!token) {
    redirect("/presentation/expired");
  }

  const result = verifyPresentationToken(token);
  if (!result.ok) {
    redirect("/presentation/expired");
  }

  redirect(`/profile/${result.payload.uid}`);
}
