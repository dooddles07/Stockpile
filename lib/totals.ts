/**
 * Document money arithmetic — the one copy.
 *
 * A priced line (Purchase Order, Sales Order, Return) carries a quantity, a
 * unit price and a discount and tax percentage, and every screen and every
 * write path has to turn those into the same numbers. The form computes them to
 * show a running total, the line editor to render each row, and the domain
 * function recomputes them from scratch because a server action is a trust
 * boundary and the browser's totals are for display only.
 *
 * That is three callers of the same arithmetic, so it lives here rather than
 * being re-typed in each: a rounding difference between what a user was shown
 * and what was stored is a bug nobody notices until a supplier disputes an
 * invoice. Plain functions, no React and no `server-only`, so the client and
 * the domain can both import it.
 *
 * Money is rounded to cents at every boundary, matching the seed generator, so
 * a created Document totals the way a seeded one does.
 */

export const roundMoney = (n: number): number => Math.round(n * 100) / 100;

/** The four fields the arithmetic needs; every line type has them. */
export interface PricedLine {
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxPct: number;
}

export interface LineMoney {
  /** Quantity times unit price, before discount and tax. */
  gross: number;
  discount: number;
  /** Gross less discount — what tax is charged on. */
  net: number;
  tax: number;
  /** Net plus tax: what the line costs. */
  lineTotal: number;
}

export function lineMoney(line: PricedLine): LineMoney {
  const gross = line.quantity * line.unitPrice;
  const discount = gross * (line.discountPct / 100);
  const net = gross - discount;
  const tax = net * (line.taxPct / 100);
  return { gross, discount, net, tax, lineTotal: roundMoney(net + tax) };
}

export interface DocumentTotals {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  /** Subtotal less discount, plus tax, plus shipping. */
  total: number;
  units: number;
}

/** The totals for a whole document. Shipping is added after tax, untaxed. */
export function documentTotals(lines: PricedLine[], shipping = 0): DocumentTotals {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;
  let units = 0;
  for (const line of lines) {
    const { gross, discount, tax } = lineMoney(line);
    subtotal += gross;
    discountTotal += discount;
    taxTotal += tax;
    units += line.quantity;
  }
  return {
    subtotal: roundMoney(subtotal),
    discountTotal: roundMoney(discountTotal),
    taxTotal: roundMoney(taxTotal),
    total: roundMoney(subtotal - discountTotal + taxTotal + shipping),
    units,
  };
}
