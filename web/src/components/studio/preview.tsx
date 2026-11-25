import { useId, useState, type ReactNode } from "react";
import { Bookmark, Heart, MessageCircle, Repeat2, Send, Share2, ThumbsUp, Globe, Ellipsis } from "lucide-react";
import { Card } from "@/card/Card";
import { bgById } from "@/card/backgrounds";
import type { Design, Palette, Profile, BackgroundId } from "@/lib/types";
import type { Size } from "@/lib/sizes";
import { mulberry32 } from "@/lib/rng";
import { foldAt } from "@/lib/linkedin";

interface CardProps {
  design: Design;
  profile: Profile;
  palette: Palette;
  size: Size;
}

/** The card at native size, scaled down to fit maxW × maxH. */
export function ScaledCard({ maxW, maxH, rounded = true, ...p }: CardProps & { maxW: number; maxH: number; rounded?: boolean }) {
  const s = Math.min(maxW / p.size.w, maxH / p.size.h, 1);
  return (
    <div
      className={rounded ? "relative overflow-hidden rounded-md shadow-[0_8px_30px_rgba(26,23,18,0.18)]" : "relative overflow-hidden"}
      style={{ width: Math.round(p.size.w * s), height: Math.round(p.size.h * s) }}
    >
      <Card {...p} style={{ position: "absolute", left: 0, top: 0, transform: `scale(${s})`, transformOrigin: "0 0" }} />
    </div>
  );
}

/** Small live thumbnail of one background, for the picker. */
export function MiniBackground({ id, palette, seed, photos, screenshot, image }: { id: BackgroundId; palette: Palette; seed: number; photos: string[]; screenshot?: string; image?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const W = 320, H = 180, u = 1.8;
  const node = bgById(id).render({
    W, H, u, area: { x: W * 0.4, y: 0, w: W * 0.6, h: H }, mask: "right", pal: palette,
    rng: mulberry32(seed * 9973 + 11), uid: `mini${uid}`, photos, screenshot, image,
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-full w-full" style={{ background: palette.base }}>
      {node}
    </svg>
  );
}

function Avatar({ profile, palette }: { profile: Profile; palette: Palette }) {
  const img = profile.headshot || (profile.mark === "image" ? profile.logoImage : undefined);
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-white" style={{ background: palette.accent }}>
      {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : (profile.displayName || "A").charAt(0).toUpperCase()}
    </div>
  );
}

function Caption({ text, limit, expandable, more = "…more" }: { text: string; limit: number; expandable?: boolean; more?: string }) {
  const [open, setOpen] = useState(false);
  const { shown, truncated } = foldAt(text, limit);
  const full = open || !truncated;
  return (
    <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-neutral-800">
      {full ? text : shown}
      {truncated && !full && (expandable
        ? <button type="button" className="ml-1 cursor-pointer text-neutral-500 hover:underline" onClick={() => setOpen(true)}>{more}</button>
        : <span className="text-neutral-500"> {more}</span>)}
    </p>
  );
}

const Act = ({ icon, label }: { icon: ReactNode; label?: string }) => (
  <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-500 [&_svg]:h-4 [&_svg]:w-4">{icon}{label}</span>
);

/** A neutral, unbranded post frame so the card can be judged in a feed context. */
export function FeedFrame({ width, caption = "", expandable, mediaSrc, documentTitle, ...p }: CardProps & { width: number; caption?: string; expandable?: boolean; /** A picture shown in place of the card. */ mediaSrc?: string; /** When set, mediaSrc is a PDF shown as LinkedIn shows a document, under this title. */ documentTitle?: string }) {
  const { profile, palette, size } = p;
  const net = size.net;
  const handle = profile.handle || "@you";
  const name = profile.displayName || profile.name;
  const own = !mediaSrc ? null : documentTitle !== undefined ? (
    <div className="border-y border-neutral-200 bg-neutral-100">
      <div className="flex items-center gap-2 bg-neutral-800 px-3 py-2 text-[12.5px] font-medium text-white">
        <span className="min-w-0 flex-1 truncate">{documentTitle}</span><span className="shrink-0 text-neutral-300">PDF</span>
      </div>
      {/* the browser's own PDF viewer: the pages as they are, to scroll through */}
      <iframe src={`${mediaSrc}#toolbar=0&navpanes=0&view=FitH`} title={`Document: ${documentTitle}`} className="block w-full border-0" style={{ height: Math.round(width * 1.05) }} />
    </div>
  ) : <img src={mediaSrc} alt="" className="block w-full" />;
  const media = own ?? <ScaledCard {...p} maxW={width} maxH={99999} rounded={false} />;
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-900 shadow-[0_8px_30px_rgba(0,0,0,0.08)]" style={{ width }}>
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <Avatar profile={profile} palette={palette} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[14px] font-semibold">
            {net === "Instagram" ? handle.replace(/^@/, "") : name}
            {net === "X" && <span className="ml-1.5 font-normal text-neutral-500">{handle} · now</span>}
          </div>
          {net === "LinkedIn" && <div className="flex items-center gap-1 text-[12px] text-neutral-500">Just now · <Globe className="h-3 w-3" /></div>}
          {net === "Facebook" && <div className="flex items-center gap-1 text-[12px] text-neutral-500">Just now · <Globe className="h-3 w-3" /></div>}
        </div>
        <Ellipsis className="h-5 w-5 text-neutral-500" />
      </div>
      {net !== "Instagram" && caption && <div className="px-3.5 pb-3"><Caption text={caption} limit={net === "X" ? 280 : 210} expandable={expandable} more={net === "LinkedIn" ? "…see more" : "…more"} /></div>}
      <div className={net === "X" ? "mx-3.5 overflow-hidden rounded-2xl border border-neutral-200" : ""}>
        {net === "X" && !own ? <ScaledCard {...p} maxW={width - 30} maxH={99999} rounded={false} /> : media}
      </div>
      {net === "Instagram" && (
        <>
          <div className="flex items-center gap-4 px-3.5 pt-3 [&_svg]:h-6 [&_svg]:w-6">
            <Heart /><MessageCircle /><Send /><span className="flex-1" /><Bookmark />
          </div>
          {caption && <div className="px-3.5 pb-3 pt-2"><Caption text={`${handle.replace(/^@/, "")}  ${caption}`} limit={125} expandable={expandable} /></div>}
        </>
      )}
      {net === "LinkedIn" && (
        <div className="flex justify-around border-t border-neutral-200 px-2 py-2.5">
          <Act icon={<ThumbsUp />} label="Like" /><Act icon={<MessageCircle />} label="Comment" /><Act icon={<Repeat2 />} label="Repost" /><Act icon={<Send />} label="Send" />
        </div>
      )}
      {net === "Facebook" && (
        <div className="flex justify-around border-t border-neutral-200 px-2 py-2.5">
          <Act icon={<ThumbsUp />} label="Like" /><Act icon={<MessageCircle />} label="Comment" /><Act icon={<Share2 />} label="Share" />
        </div>
      )}
      {net === "X" && (
        <div className="flex justify-between px-5 py-3">
          <Act icon={<MessageCircle />} /><Act icon={<Repeat2 />} /><Act icon={<Heart />} /><Act icon={<Bookmark />} /><Act icon={<Share2 />} />
        </div>
      )}
    </div>
  );
}
