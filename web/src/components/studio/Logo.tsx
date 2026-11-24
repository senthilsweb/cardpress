/** Mark, wordmark and a small line under it. The line is hidden on narrow screens. */
export function Logo() {
  return (
    <a href={import.meta.env.BASE_URL} className="flex items-center gap-2.5" aria-label="CardPress home">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden className="shrink-0">
        <rect x="2.5" y="3.5" width="25" height="23" rx="7.5" className="fill-gold" />
        <rect x="8" y="11" width="14" height="2.4" rx="1.2" className="fill-foreground" opacity="0.85" />
        <rect x="8" y="16" width="9" height="2.4" rx="1.2" className="fill-foreground" opacity="0.55" />
        <path d="M27 19Q27.9 25.1 34 26Q27.9 26.9 27 33Q26.1 26.9 20 26Q26.1 25.1 27 19Z" className="stroke-background fill-foreground" strokeWidth="3" strokeLinejoin="round" paintOrder="stroke" />
      </svg>
      <div className="flex flex-col leading-none">
        <span className="text-[22px] font-bold tracking-tight text-foreground">CardPress</span>
        <span className="mt-1 hidden text-[10.5px] text-muted-foreground md:block">Agentic AI for social media authoring and management</span>
      </div>
    </a>
  );
}
