import { useEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Video } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Asset } from "@/lib/assets";
import { cn } from "@/lib/utils";

/** An entry's thumbnail, fetched when it comes near the screen; an icon for what has none. */
export function Thumb({ asset, className }: { asset: Asset; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!asset.hasThumb || !box.current) return;
    let gone = false, made = "";
    const watch = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      watch.disconnect();
      api.assetBlob(asset.profileId, asset.id, "thumb").then((b) => { if (gone) return; made = URL.createObjectURL(b); setUrl(made); }, () => { if (!gone) setFailed(true); });
    }, { rootMargin: "200px" });
    watch.observe(box.current);
    return () => { gone = true; watch.disconnect(); if (made) URL.revokeObjectURL(made); };
  }, [asset.id, asset.profileId, asset.hasThumb]);

  const Icon = asset.kind === "pdf" ? FileText : asset.kind === "video" ? Video : ImageIcon;
  return (
    <div ref={box} className={cn("relative grid place-items-center overflow-hidden bg-muted", className)}>
      {url ? <img src={url} alt="" className="absolute inset-0 h-full w-full object-contain" />
        : asset.hasThumb && !failed ? <Skeleton className="h-full w-full rounded-none" />
          : <Icon aria-hidden className="h-1/3 max-h-10 w-1/3 max-w-10 text-muted-foreground" />}
    </div>
  );
}
