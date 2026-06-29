import type {Metadata} from "next";
import {PublicImageView} from "@/components/public/PublicImageView";
import {getPublicImageViewData} from "@/lib/image-view-url";
import {getCreatorAppPublicOrigin} from "@/lib/public-media-urls";

export const revalidate = 60;

type Params = {id: string};

export async function generateMetadata({params}: {params: Promise<Params>}): Promise<Metadata> {
  const {id} = await params;
  const origin = getCreatorAppPublicOrigin();
  const watchUrl = `${origin}/i/${id}`;

  return {
    title: "Verified image — SAIVD",
    description: "Cryptographically verified image, watermarked at the source.",
    openGraph: {
      type: "website",
      url: watchUrl,
      title: "Verified image — SAIVD",
    },
  };
}

export default async function PublicImagePage({params}: {params: Promise<Params>}) {
  const {id} = await params;
  const result = await getPublicImageViewData(id);

  return <PublicImageView imageId={id} result={result} />;
}
