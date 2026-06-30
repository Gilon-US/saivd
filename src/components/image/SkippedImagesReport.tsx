import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {AlertCircleIcon} from "lucide-react";
import type {SkippedImageUpload} from "@/lib/image-deduplication";

type SkippedImagesReportProps = {
  skipped: SkippedImageUpload[];
};

export function SkippedImagesReport({skipped}: SkippedImagesReportProps) {
  if (skipped.length === 0) return null;

  return (
    <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-50">
      <AlertCircleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle>
        {skipped.length} duplicate image{skipped.length === 1 ? "" : "s"} skipped
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-2 max-h-40 overflow-y-auto space-y-1 text-sm">
          {skipped.map((item) => (
            <li key={`${item.file.name}-${item.file.size}-${item.reason}`} className="flex flex-col sm:flex-row sm:gap-2">
              <span className="font-medium truncate">{item.file.name}</span>
              <span className="text-amber-800/80 dark:text-amber-200/80 shrink-0">{item.message}</span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
