import { Heart } from "lucide-react";

const TAGLINE = "Agentic AI for social media authoring and management";

/**
 * The CardPress mark: a gold card with two dark text lines and a dark sparkle with a light outline. Same drawing as the
 * favicon. The header sets --mark-fill and --mark-line, as its own text colours would turn the mark white.
 */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden className="shrink-0">
      <rect x="2.5" y="3.5" width="25" height="23" rx="7.5" className="fill-gold" />
      <rect x="8" y="11" width="14" height="2.4" rx="1.2" style={{ fill: "var(--mark-fill, var(--foreground))" }} opacity="0.85" />
      <rect x="8" y="16" width="9" height="2.4" rx="1.2" style={{ fill: "var(--mark-fill, var(--foreground))" }} opacity="0.55" />
      <path d="M27 19Q27.9 25.1 34 26Q27.9 26.9 27 33Q26.1 26.9 20 26Q26.1 25.1 27 19Z" style={{ fill: "var(--mark-fill, var(--foreground))", stroke: "var(--mark-line, var(--background))" }} strokeWidth="3" strokeLinejoin="round" paintOrder="stroke" />
    </svg>
  );
}

/**
 * Mark, name and the line under it. In the editor it sits in the header (the line is hidden on narrow screens);
 * `stacked` centres it above the sign-in and sign-up forms.
 */
export function Logo({ stacked = false }: { stacked?: boolean }) {
  if (stacked) {
    return (
      <a href={import.meta.env.BASE_URL} className="flex flex-col items-center gap-3 text-center" aria-label="CardPress home">
        <LogoMark size={52} />
        <div className="flex flex-col leading-none">
          <span className="text-[28px] font-bold tracking-tight text-foreground">CardPress</span>
          <span className="mx-auto mt-2 max-w-[18rem] text-[12.5px] leading-snug text-muted-foreground">{TAGLINE}</span>
        </div>
      </a>
    );
  }
  return (
    <a href={import.meta.env.BASE_URL} className="flex items-center gap-2.5" aria-label="CardPress home">
      <LogoMark />
      <div className="flex flex-col leading-none">
        <span className="text-[22px] font-bold tracking-tight text-foreground">CardPress</span>
        <span className="mt-1 hidden text-[10.5px] text-muted-foreground md:block">{TAGLINE}</span>
      </div>
    </a>
  );
}

/** A small credit line. */
export function BuiltWith({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[11px] text-muted-foreground ${className}`}>
      Built with <Heart aria-label="love" className="inline h-3 w-3 -translate-y-px fill-red-500 text-red-500" /> by{" "}
      <a href="https://www.senthilsweb.com" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-foreground hover:underline">www.senthilsweb.com</a>
    </p>
  );
}
