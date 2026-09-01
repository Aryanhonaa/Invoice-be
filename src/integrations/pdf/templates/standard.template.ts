import type { InvoicePdfContext, InvoicePdfTemplate } from "../types.js";

function money(value: string, currency: string): string {
  const amount = Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${amount}`;
}

function formatDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

export const standardInvoiceTemplate: InvoicePdfTemplate = {
  id: "standard",
  name: "Standard invoice",
  render(doc, context: InvoicePdfContext) {
    const { invoice } = context;
    const left = 50;
    let y = 50;

    doc.rect(left, y, 72, 48).stroke();
    doc.fontSize(9).fillColor("#64748b").text("LOGO", left, y + 18, { width: 72, align: "center" });

    doc.fillColor("#0f172a").fontSize(20).text(invoice.organization?.name ?? "Company", left + 90, y);
    doc.fontSize(10).fillColor("#475569").text("Invoice", left + 90, y + 26);

    doc.fontSize(16).fillColor("#0f172a").text(invoice.invoiceNumber, 360, y, { align: "right" });
    doc.fontSize(10).fillColor("#475569").text(`Status: ${invoice.status}`, 360, y + 22, {
      align: "right",
    });
    doc.text(`Payment: ${invoice.paymentStatus}`, 360, y + 36, { align: "right" });

    y = 130;
    doc.fillColor("#0f172a").fontSize(11).text("Bill to", left, y);
    doc.fontSize(10).fillColor("#334155");
    doc.text(invoice.customer.name, left, y + 16);
    if (invoice.customer.company) {
      doc.text(invoice.customer.company, left, y + 30);
    }
    if (invoice.billingAddress) {
      const address = [
        invoice.billingAddress.line1,
        invoice.billingAddress.line2,
        [invoice.billingAddress.city, invoice.billingAddress.region, invoice.billingAddress.postalCode]
          .filter(Boolean)
          .join(", "),
        invoice.billingAddress.country,
      ]
        .filter(Boolean)
        .join("\n");
      doc.text(address, left, y + 44, { width: 240 });
    }

    doc.fillColor("#0f172a").text(`Invoice date: ${formatDate(invoice.invoiceDate)}`, 360, y);
    doc.text(`Due date: ${formatDate(invoice.dueDate)}`, 360, y + 16);
    doc.text(`Currency: ${invoice.currency}`, 360, y + 32);

    y = 240;
    const columns = [
      { label: "Item", x: left, width: 170 },
      { label: "Qty", x: 230, width: 40 },
      { label: "Price", x: 275, width: 70 },
      { label: "Disc.", x: 350, width: 60 },
      { label: "Tax", x: 415, width: 55 },
      { label: "Total", x: 475, width: 75 },
    ];

    doc.rect(left, y, 500, 22).fill("#f1f5f9");
    doc.fillColor("#0f172a").fontSize(9);
    for (const column of columns) {
      doc.text(column.label, column.x, y + 6, { width: column.width });
    }

    y += 28;
    doc.fontSize(9).fillColor("#334155");
    for (const item of invoice.items) {
      doc.text(item.description, columns[0].x, y, { width: columns[0].width });
      doc.text(Number(item.quantity).toString(), columns[1].x, y, { width: columns[1].width });
      doc.text(money(item.unitPrice, invoice.currency), columns[2].x, y, { width: columns[2].width });
      doc.text(money(item.discount, invoice.currency), columns[3].x, y, { width: columns[3].width });
      doc.text(money(item.taxAmount, invoice.currency), columns[4].x, y, { width: columns[4].width });
      doc.text(money(item.lineTotal, invoice.currency), columns[5].x, y, { width: columns[5].width });
      y += 22;
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    }

    y += 10;
    const summaryX = 360;
    doc.fillColor("#0f172a").fontSize(10);
    doc.text("Subtotal", summaryX, y);
    doc.text(money(invoice.subtotal, invoice.currency), 475, y, { width: 75, align: "left" });
    y += 16;
    doc.text("Discount", summaryX, y);
    doc.text(money(invoice.discountAmount, invoice.currency), 475, y);
    y += 16;
    doc.text("Tax", summaryX, y);
    doc.text(money(invoice.taxAmount, invoice.currency), 475, y);
    y += 16;
    doc.fontSize(12).text("Total", summaryX, y);
    doc.text(money(invoice.total, invoice.currency), 475, y);
    y += 18;
    doc.fontSize(10).text("Amount paid", summaryX, y);
    doc.text(money(invoice.amountPaid, invoice.currency), 475, y);
    y += 16;
    doc.text("Balance due", summaryX, y);
    doc.text(money(invoice.balanceDue, invoice.currency), 475, y);

    y += 36;
    if (invoice.notes) {
      doc.fontSize(11).fillColor("#0f172a").text("Notes", left, y);
      doc.fontSize(10).fillColor("#334155").text(invoice.notes, left, y + 16, { width: 500 });
      y += 50;
    }
    if (invoice.terms) {
      doc.fontSize(11).fillColor("#0f172a").text("Terms", left, y);
      doc.fontSize(10).fillColor("#334155").text(invoice.terms, left, y + 16, { width: 500 });
    }
  },
};

export function getInvoicePdfTemplate(templateId?: string): InvoicePdfTemplate {
  if (!templateId || templateId === standardInvoiceTemplate.id) {
    return standardInvoiceTemplate;
  }
  return standardInvoiceTemplate;
}
