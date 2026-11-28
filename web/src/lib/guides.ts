/** A brand's guide of one kind, with what our writers come with. An empty body means our house style is used. */
export interface Guide {
  kind: "post" | "article" | "greeting";
  body: string;
  version: number;
  updatedAt?: string;
  updatedBy?: string;
  ours?: string;
  fixed?: string;
}
export interface GuidesView { guides: Guide[]; maxChars: number; checked: boolean }
export interface GuideVersion { version: number; body: string; createdAt: string; createdBy?: string }

export const GUIDE_LABELS: Record<Guide["kind"], string> = { post: "Posts", article: "Articles", greeting: "Greetings" };

/** What is saved of what was typed: the server trims it the same way. */
export const tidyGuide = (body: string) => body.replace(/\r\n/g, "\n").trim();

/** How many characters a guide has, as the server counts them. */
export const guideLength = (body: string) => [...tidyGuide(body)].length;

/** Why this cannot be saved, or null. The server holds the rest of the rules. */
export function guideProblem(body: string, max: number): string | null {
  const n = guideLength(body);
  return n > max ? `Too long: ${n} of ${max} characters.` : null;
}
