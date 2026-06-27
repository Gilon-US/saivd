"use client";

import {useCallback, useEffect, useState} from "react";

type ImagePreferencesResponse = {
  success: boolean;
  data?: {
    displayFilter: string | null;
    conversionRevision: string;
  };
};

export function useImageDisplayPreferences() {
  const [displayFilter, setDisplayFilter] = useState<string | undefined>(undefined);
  const [conversionRevision, setConversionRevision] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/image-preferences", {cache: "no-store"});
      const json = (await res.json()) as ImagePreferencesResponse;
      if (res.ok && json.success && json.data) {
        setDisplayFilter(json.data.displayFilter ?? undefined);
        setConversionRevision(json.data.conversionRevision);
      }
    } catch {
      // keep defaults — previews still work without CSS tuning
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const onChanged = () => {
      void reload();
    };
    window.addEventListener("saivd:image-preferences-changed", onChanged);
    return () => window.removeEventListener("saivd:image-preferences-changed", onChanged);
  }, [reload]);

  return {displayFilter, conversionRevision, loading, reload};
}
