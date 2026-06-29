"use client";

import {useCallback} from "react";
import {LinkIcon, Share2Icon} from "lucide-react";
import {Button} from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {useToast} from "@/hooks/useToast";
import {copyTextToClipboard} from "@/lib/copy-to-clipboard";
import {
  getPublicEmbedSnippet,
  getPublicWatchUrl,
  type PublicMediaKind,
} from "@/lib/public-media-urls";

type MediaShareDropdownProps = {
  mediaKind: PublicMediaKind;
  mediaId: string;
  mediaFilename: string;
  /** When false, public link / embed are disabled (e.g. not yet processed). */
  publicLinksEnabled: boolean;
  onShareToViewer: () => void;
};

export function MediaShareDropdown({
  mediaKind,
  mediaId,
  mediaFilename,
  publicLinksEnabled,
  onShareToViewer,
}: MediaShareDropdownProps) {
  const {toast} = useToast();
  const assetLabel = mediaKind === "image" ? "image" : "video";

  const handleCopyLink = useCallback(async () => {
    const copyUrl = getPublicWatchUrl(mediaKind, mediaId);
    try {
      await copyTextToClipboard(copyUrl);
      toast({title: "Link copied", description: copyUrl, variant: "success"});
    } catch (err) {
      console.error("Failed to copy public link:", err);
      toast({
        title: "Couldn't copy link",
        description:
          err instanceof Error
            ? err.message
            : "Your browser blocked copying. Long-press to share manually.",
        variant: "error",
      });
    }
  }, [mediaId, mediaKind, toast]);

  const handleCopyEmbed = useCallback(async () => {
    const snippet = getPublicEmbedSnippet(mediaKind, mediaId);
    try {
      await copyTextToClipboard(snippet);
      toast({
        title: "Embed code copied",
        description: "Paste it into your site's HTML.",
        variant: "success",
      });
    } catch (err) {
      console.error("Failed to copy embed code:", err);
      toast({
        title: "Couldn't copy embed code",
        description: err instanceof Error ? err.message : "Copy failed",
        variant: "error",
      });
    }
  }, [mediaId, mediaKind, toast]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          title={`Share "${mediaFilename}"`}
          aria-label={`Share ${assetLabel}`}>
          <LinkIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!publicLinksEnabled} onClick={() => void handleCopyLink()}>
          Copy public link
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!publicLinksEnabled} onClick={() => void handleCopyEmbed()}>
          Copy embed code
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onShareToViewer}>
          <Share2Icon className="h-4 w-4" />
          Share to viewer account
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
