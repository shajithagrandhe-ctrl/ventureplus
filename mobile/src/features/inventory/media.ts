import { useEffect, useState } from "react";
import { mediaKindFromContentType, mediaKindFromUrl, type MediaKind } from "./contracts";

// MongoDB assets use extensionless URLs; inspect headers without downloading files.
export function useMediaKind(uri?: string) {
  const inferred = mediaKindFromUrl(uri);
  const [resolved, setResolved] = useState<{ uri: string; kind: MediaKind }>();
  useEffect(() => {
    if (!uri || inferred !== "unknown") return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    void fetch(uri, { method: "HEAD", signal: controller.signal, credentials: "omit" })
      .then(response => { if (active) setResolved({ uri, kind: response.ok ? mediaKindFromContentType(response.headers.get("content-type")) : "unknown" }); })
      .catch(() => { if (active) setResolved({ uri, kind: "unknown" }); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [uri, inferred]);
  return { kind: inferred !== "unknown" ? inferred : resolved?.uri === uri ? resolved?.kind ?? "unknown" : "unknown",
    loading: !!uri && inferred === "unknown" && resolved?.uri !== uri };
}
