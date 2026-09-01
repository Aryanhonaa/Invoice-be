import { describe, expect, it } from "vitest";
import { calculateInvoiceLine, calculateInvoiceTotals } from "../src/lib/invoice-calc.js";
import { deriveInvoiceStatus, derivePaymentStatus } from "../src/lib/invoice-status.js";

describe("invoice calculations", () => {
  it("calculates line tax after discount using exact decimals", () => {
    const line = calculateInvoiceLine({
      quantity: "2",
      unitPrice: "10.00",
      discount: "1.00",
      taxRate: "10",
    });

    expect(line.lineSubtotal).toBe("20.0000");
    expect(line.discountAmount).toBe("1.0000");
    expect(line.taxAmount).toBe("1.9000");
    expect(line.lineTotal).toBe("20.9000");
  });

  it("avoids floating-point drift on repeating money values", () => {
    const totals = calculateInvoiceTotals([
      { quantity: "3", unitPrice: "0.10", taxRate: "0" },
      { quantity: "1", unitPrice: "0.20", taxRate: "0" },
    ]);

    expect(totals.subtotal).toBe("0.5000");
    expect(totals.total).toBe("0.5000");
  });

  it("caps a line discount at the line subtotal", () => {
    const line = calculateInvoiceLine({
      quantity: "1",
      unitPrice: "5",
      discount: "9",
      taxRate: "13",
    });

    expect(line.discountAmount).toBe("5.0000");
    expect(line.taxAmount).toBe("0.0000");
    expect(line.lineTotal).toBe("0.0000");
  });

  it("sums invoice totals from line snapshots", () => {
    const totals = calculateInvoiceTotals([
      { quantity: "1", unitPrice: "100", discount: "10", taxRate: "13" },
      { quantity: "2", unitPrice: "25", taxRate: "0" },
    ]);

    expect(totals.subtotal).toBe("150.0000");
    expect(totals.discountAmount).toBe("10.0000");
    expect(totals.taxAmount).toBe("11.7000");
    expect(totals.total).toBe("151.7000");
  });
});

describe("invoice status", () => {
  it("derives payment status from amounts", () => {
    expect(derivePaymentStatus("100.0000", "0", "SENT")).toBe("UNPAID");
    expect(derivePaymentStatus("100.0000", "40", "SENT")).toBe("PARTIALLY_PAID");
    expect(derivePaymentStatus("100.0000", "100", "SENT")).toBe("PAID");
    expect(derivePaymentStatus("100.0000", "0", "CANCELLED")).toBe("NONE");
    expect(derivePaymentStatus("0.0000", "0", "SENT")).toBe("PAID");
    expect(derivePaymentStatus("0.0000", "0", "DRAFT")).toBe("UNPAID");
  });

  it("marks unpaid sent invoices overdue after the due date", () => {
    const status = deriveInvoiceStatus({
      storedStatus: "SENT",
      total: "50.0000",
      amountPaid: "0",
      dueDate: new Date("2020-01-01T00:00:00.000Z"),
      now: new Date("2026-01-02T00:00:00.000Z"),
    });
    expect(status).toBe("OVERDUE");
  });
});
