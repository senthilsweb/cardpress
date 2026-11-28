# Plans and payments

**Status:** a first sketch for discussion, asked for by the owner on 2026-11-28. Not planned as bolts yet. Every
number below is an example, not a decision.

## Asked for
Payment through Stripe, an "Upgrade" in the profile menu, and a simple price that covers hosting, the API and tax
with a markup.

## What has to be true first
- **A budget per brand** ([`2027-01-06`](../2027-01-06-brand-assistant-settings/proposal.md)). A plan is then little
  more than a monthly amount set by a payment instead of by an administrator.
- **Chat for people who are not administrators.** With the real agent the chat is for administrators only, because
  its tools act as one account. A paying person needs their own key and vault (an open task of `2026-12-02`).
- The app's headers forbid the payment feature today (`Permissions-Policy: payment=()`); the content policy must
  allow Stripe's pages.

## Decided
A plan is per brand (owner, 2026-11-28). A person on their own makes a brand for themselves.

## A simple price
One formula, shown to the owner only:

`price = hosting share + assistant allowance × (1 + markup) + payment fee`, with tax added on top by Stripe Tax.

| Part | Where the number comes from |
|---|---|
| Hosting share | The month's hosting bill divided by the paying accounts expected |
| Assistant allowance | The list cost the plan includes each month. It is the brand's budget |
| Markup | A percentage on the allowance, for our risk and work (for example 30 to 50 %) |
| Payment fee | Stripe's percentage and fixed fee per charge |
| Tax | Worked out and collected by Stripe Tax, by the buyer's country; never part of our price |

Example only: hosting share $2, allowance $5, markup 40 %, fee about $0.60 gives a plan of about $10 a month.

| Plan (example) | Per month | Assistant allowance | Models |
|---|---|---|---|
| Free | $0 | none, or a small trial amount once | ours |
| Standard | $10 | $5 | ours |
| Plus | $25 | $14 | stronger models allowed |
| Top-up | $5 each | $3.50, does not expire in the month | |

The person sees money left as a bar, not tokens. Cost is counted at list price, as the budget already does.

## How it would work
- Stripe Checkout for the first payment and Stripe's customer portal for card, invoices and cancelling: no card data
  touches CardPress.
- A webhook, checked by its signature, sets the plan: the brand's monthly amount and its tier. A missed or
  repeated webhook must not change the result.
- The profile menu shows the plan and "Upgrade"; Settings → Me → Plan shows the amount left, invoices and "Manage".
- A cancelled or unpaid plan goes back to Free at the period's end. Nothing is deleted.
- Self-hosted servers have no plans: with no Stripe keys configured the feature does not appear.

## Questions for the owner
1. Does an unused allowance carry over? (Simplest: no.)
2. One currency (USD) to start?
3. Which countries at first? It decides the tax registration needed.
4. Is the stronger model a plan feature, or simply paid from the allowance at its higher cost?
5. Who is the seller on the invoice, and what is the refund rule?
6. What does Free allow: design and publishing without the assistant?

## Not decided here
Annual prices, teams and seats, coupons, a trial period.
