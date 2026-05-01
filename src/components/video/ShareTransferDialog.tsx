"use client";

import {useState, useEffect} from "react";
import {Button} from "@/components/ui/button";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {XIcon, CopyIcon, CheckIcon, Share2Icon, AlertTriangleIcon} from "lucide-react";

type ShareTransferDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  videoId: string | null;
  videoFilename: string;
};

type TransferResponse = {
  token: string;
  share_url: string;
  expires_at: string;
};

/**
 * Share dialog for the cross-app video transfer feature.
 *
 * Workflow:
 *   1. Creator opens this dialog from a video card.
 *   2. Clicks "Generate share link" → POST /api/transfers.
 *   3. Dialog shows the share URL + expiry. Creator can copy it.
 *   4. Creator messages the URL to the viewer (out-of-band).
 *
 * The plaintext token is shown only here, never persisted in the UI. Closing
 * the dialog discards it; if the creator forgets to copy, they can generate
 * a fresh transfer (the previous one will simply expire unused after 24h).
 */
export function ShareTransferDialog({isOpen, onClose, videoId, videoFilename}: ShareTransferDialogProps) {
  const [generating, setGenerating] = useState(false);
  const [transfer, setTransfer] = useState<TransferResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset on open/close so re-opening starts clean.
  useEffect(() => {
    if (!isOpen) {
      setTransfer(null);
      setError(null);
      setCopied(false);
      setGenerating(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleGenerate = async () => {
    if (!videoId) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({video_id: videoId}),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.success || !body?.data?.share_url) {
        throw new Error(body?.error?.message ?? `Failed to create share link (status ${res.status})`);
      }

      setTransfer(body.data as TransferResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share link");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!transfer?.share_url) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(transfer.share_url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = transfer.share_url;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy");
    }
  };

  const expiresLabel = transfer?.expires_at ? new Date(transfer.expires_at).toLocaleString() : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Share2Icon className="h-5 w-5" />
            Share to viewer
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={generating}>
            <XIcon className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">Sharing</p>
            <p className="font-medium truncate" title={videoFilename}>
              {videoFilename}
            </p>
          </div>

          {!transfer && !error && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Create a one-time share link the viewer can use to claim this video into their own SAIVD Viewer account.
                The link expires in 24 hours and stops working after the first successful claim.
              </p>
              <Button onClick={handleGenerate} disabled={generating || !videoId} className="w-full">
                {generating ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Generating...
                  </>
                ) : (
                  "Generate share link"
                )}
              </Button>
            </>
          )}

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-3 flex items-start gap-2">
              <AlertTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700 dark:text-red-300">{error}</div>
            </div>
          )}

          {transfer && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Send this link to the viewer. It will stop working after the first claim or at{" "}
                <span className="font-medium">{expiresLabel}</span>.
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={transfer.share_url}
                  className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs font-mono"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button onClick={handleCopy} variant="outline" size="icon" aria-label="Copy share link">
                  {copied ? <CheckIcon className="h-4 w-4 text-green-600" /> : <CopyIcon className="h-4 w-4" />}
                </Button>
              </div>
              {copied && <p className="text-xs text-green-600 dark:text-green-400">Copied to clipboard</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 p-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={generating}>
            {transfer ? "Done" : "Cancel"}
          </Button>
        </div>
      </div>
    </div>
  );
}
