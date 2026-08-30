import { describe, expect, it } from "vitest";
import { formatMoney, money } from "@/lib/money";

/**
 * The numbers on a client's document.
 *
 * Worth pinning more than most things here: these are the figures somebody
 * reads before they pay, and a wrong one is not a bug report — it is a
 * conversation about whether the rest of the document can be trusted.
 */

describe("money", () => {
  it("takes the discount off the quote", () => {
    const sums = money(185000, 15000, []);

    expect(sums.total).toBe(170000);
    expect(sums.outstanding).toBe(170000);
    expect(sums.paid).toBe(0);
  });

  it("adds the receipts up", () => {
    const sums = money(100000, 0, [{ amount: 30000 }, { amount: 20000 }]);

    expect(sums.paid).toBe(50000);
    expect(sums.outstanding).toBe(50000);
    expect(sums.percentPaid).toBe(50);
  });

  it("reports an overpayment as credit, never as a negative balance", () => {
    /*
      "Outstanding: -5,000" reads as a fault in the software, on a document
      going to a client. It happens for ordinary reasons — a rounded transfer,
      a duplicate — and the honest presentation is two separate facts.
    */
    const sums = money(100000, 0, [{ amount: 105000 }]);

    expect(sums.outstanding).toBe(0);
    expect(sums.overpaid).toBe(5000);
    expect(sums.percentPaid).toBe(100);
  });

  it("will not let a discount make the total negative", () => {
    // A typo in the discount box should not invent money.
    const sums = money(50000, 80000, []);

    expect(sums.discount).toBe(50000);
    expect(sums.total).toBe(0);
    expect(sums.outstanding).toBe(0);
  });

  it("treats missing numbers as zero rather than as NaN", () => {
    // NaN reaches the page as "₹NaN", which is worse than a blank.
    const sums = money(null, undefined, []);

    expect(sums.total).toBe(0);
    expect(sums.percentPaid).toBe(0);
    expect(Number.isNaN(sums.outstanding)).toBe(false);
  });

  it("ignores a negative amount rather than subtracting it", () => {
    expect(money(-100, 0, []).quoted).toBe(0);
    expect(money(100000, -500, []).discount).toBe(0);
  });

  it("keeps two decimal places without floating-point noise", () => {
    // 0.1 + 0.2 is the classic. Money that adds up to 0.30000000000000004 on a
    // document is a document somebody screenshots.
    expect(money(1, 0, [{ amount: 0.1 }, { amount: 0.2 }]).paid).toBe(0.3);
  });

  it("says nothing is paid on a project worth nothing, rather than everything", () => {
    // A division by zero would be NaN; treating it as 100% would be worse — it
    // would show a brand new project as fully paid.
    expect(money(0, 0, []).percentPaid).toBe(0);
  });
});

describe("formatMoney", () => {
  it("groups the way an Indian invoice does", () => {
    // 1,85,000 rather than 185,000. Getting this wrong makes the whole document
    // look like it was written for somewhere else.
    expect(formatMoney(185000)).toContain("1,85,000");
  });

  it("carries the currency symbol", () => {
    expect(formatMoney(1000)).toContain("₹");
  });
});
