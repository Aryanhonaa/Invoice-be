import PDFDocument from "pdfkit";
import type { InvoiceView } from "../../types/invoice.js";
import { getInvoicePdfTemplate } from "./templates/standard.template.js";

export async function renderInvoicePdf(
  invoice: InvoiceView,
  templateId?: string,
): Promise<Buffer> {
  const template = getInvoicePdfTemplate(templateId);
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);

    template.render(doc, { invoice });
    doc.end();
  });
}
