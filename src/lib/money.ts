/**
 * What a project is worth, and what is left on it.
 *
 * **Three of these four numbers are never stored.** Only the quote, the discount
 * and the individual payments are typed by a person; the rest is arithmetic done
 * here and in `20260830000010_money_and_approval.sql`.
 *
 * That is the same rule as progress, for the same reason: a figure somebody
 * types drifts from the rows it summarises, and a client who catches one wrong
 * number on a document stops believing every other number on it.
 */

export interface Money {
  /** The quote, before anything was knocked off. */
  quoted: number;
  /** What was knocked off. Shown as its own line rather than folded into the total. */
  discount: number;
  /** What is actually owed. */
  total: number;
  /** The sum of the receipts. */
  paid: number;
  /** What is still to come. Never negative — see below. */
  outstanding: number;
  /** How much of the total has arrived, 0–100. */
  percentPaid: number;
  /** Paid more than the total. A real state, and one worth saying out loud. */
  overpaid: number;
}

export function money(
  quotedAmount: number | null | undefined,
  discountAmount: number | null | undefined,
  payments: { amount: number }[],
): Money {
  const quoted = toAmount(quotedAmount);
  const discount = Math.min(toAmount(discountAmount), quoted);
  const total = round(quoted - discount);
  const paid = round(payments.reduce((sum, entry) => sum + toAmount(entry.amount), 0));

  /*
    Overpayment is separated rather than shown as a negative balance.

    "Outstanding: -5,000" is a sentence nobody reads correctly at a glance, and
    on a document sent to a client it reads as a mistake in the software. It
    happens for ordinary reasons — a rounded transfer, a duplicate payment — and
    the honest presentation is "nothing outstanding" plus "5,000 in credit".
  */
  const balance = round(total - paid);

  return {
    quoted,
    discount,
    total,
    paid,
    outstanding: balance > 0 ? balance : 0,
    overpaid: balance < 0 ? Math.abs(balance) : 0,
    percentPaid: total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0,
  };
}

/**
 * Rupees, written the way an Indian invoice writes them.
 *
 * `en-IN` groups as 1,85,000 rather than 185,000 — which is what a reader here
 * expects, and getting it wrong on a document is a small thing that makes the
 * whole document look foreign.
 */
export function formatMoney(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function toAmount(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) return 0;
  return value;
}

/** Two decimal places, because money is not a float you can add up carelessly. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
