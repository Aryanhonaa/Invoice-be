import { money, moneyString, roundMoney } from "./money.js";

export interface InvoiceLineInput {
  quantity: string;
  unitPrice: string;
  discount?: string;
  taxRate?: string;
}

export interface InvoiceLineTotals {
  lineSubtotal: string;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
}

export interface InvoiceTotals {
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  lines: InvoiceLineTotals[];
}

export function calculateInvoiceLine(input: InvoiceLineInput): InvoiceLineTotals {
  const quantity = money(input.quantity);
  const unitPrice = money(input.unitPrice);
  const discount = money(input.discount ?? "0");
  const taxRate = money(input.taxRate ?? "0");

  if (quantity.lt(0) || unitPrice.lt(0) || discount.lt(0) || taxRate.lt(0)) {
    throw new Error("Invoice amounts cannot be negative");
  }
  if (taxRate.gt(100)) {
    throw new Error("Tax rate cannot exceed 100");
  }

  const lineSubtotal = roundMoney(quantity.times(unitPrice));
  const discountAmount = roundMoney(discount.gt(lineSubtotal) ? lineSubtotal : discount);
  const taxable = roundMoney(lineSubtotal.minus(discountAmount));
  const taxAmount = roundMoney(taxable.times(taxRate).dividedBy(100));
  const lineTotal = roundMoney(taxable.plus(taxAmount));

  return {
    lineSubtotal: moneyString(lineSubtotal),
    discountAmount: moneyString(discountAmount),
    taxAmount: moneyString(taxAmount),
    lineTotal: moneyString(lineTotal),
  };
}

export function calculateInvoiceTotals(lines: InvoiceLineInput[]): InvoiceTotals {
  if (lines.length === 0) {
    throw new Error("An invoice must include at least one item");
  }

  const calculated = lines.map(calculateInvoiceLine);
  const subtotal = calculated.reduce((sum, line) => sum.plus(line.lineSubtotal), money(0));
  const discountAmount = calculated.reduce((sum, line) => sum.plus(line.discountAmount), money(0));
  const taxAmount = calculated.reduce((sum, line) => sum.plus(line.taxAmount), money(0));
  const total = calculated.reduce((sum, line) => sum.plus(line.lineTotal), money(0));

  return {
    subtotal: moneyString(subtotal),
    discountAmount: moneyString(discountAmount),
    taxAmount: moneyString(taxAmount),
    total: moneyString(total),
    lines: calculated,
  };
}
