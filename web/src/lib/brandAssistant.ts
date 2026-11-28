/** How the assistant works for one brand. An administrator sets it. */
export interface BrandAssistant {
  tier: string;
  checks: boolean;
  rounds: number;
  /** What the brand may spend in a month, in cents; 0 is no amount of its own. */
  monthCents: number;
  alertPercent: number;
}
export interface Tier { id: string; name: string; models?: { role: string; model: string }[] }
export interface BrandAssistantView { settings: BrandAssistant; defaults: BrandAssistant; saved: boolean; tiers: Tier[]; tierGone?: string }

export const ROUND_CHOICES = [1, 2, 3, 4, 5] as const;
export const ALERT_CHOICES = [50, 60, 70, 75, 80, 85, 90, 95] as const;
export const MAX_MONTH_CENTS = 100000;

/** The amount as typed: "25" or "25.50"; empty for none. */
export const amountText = (cents: number) => (cents > 0 ? (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)) : "");

/** What was typed as cents: 0 for nothing, NaN for what is not an amount. */
export function amountCents(text: string): number {
  const t = text.trim();
  if (t === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return Number.NaN;
  return Math.round(Number(t) * 100);
}

/** Why these cannot be saved, or null. The server checks again. */
export function assistantProblem(s: BrandAssistant): string | null {
  if (!Number.isInteger(s.rounds) || s.rounds < 1 || s.rounds > 5) return "Rounds: 1 to 5.";
  if (!Number.isInteger(s.monthCents) || s.monthCents < 0 || s.monthCents > MAX_MONTH_CENTS) return `Monthly budget: up to ${MAX_MONTH_CENTS / 100}, or empty for none.`;
  if (s.alertPercent < 50 || s.alertPercent > 95) return "Alert: 50 to 95 percent.";
  return null;
}
