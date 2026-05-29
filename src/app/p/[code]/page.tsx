import {redirect} from "next/navigation";
import {isPresentationQrEnabled} from "@/lib/presentation-qr/constants";
import {isValidPresentationCode} from "@/lib/presentation-qr/code";
import {lookupPresentationCode} from "@/lib/presentation-qr/store";

type PresentationCodePageProps = {
  params: Promise<{code: string}>;
};

export default async function PresentationCodePage({params}: PresentationCodePageProps) {
  if (!isPresentationQrEnabled()) {
    redirect("/presentation/expired");
  }

  const {code} = await params;
  if (!isValidPresentationCode(code)) {
    redirect("/presentation/expired");
  }

  const record = await lookupPresentationCode(code);
  if (!record) {
    redirect("/presentation/expired");
  }

  redirect(`/profile/${record.uid}`);
}
