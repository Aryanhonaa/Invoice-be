import type { InvoiceView } from "../../types/invoice.js";

export interface InvoicePdfContext {
  invoice: InvoiceView;
}

export interface InvoicePdfTemplate {
  id: string;
  name: string;
  render(doc: PDFKit.PDFDocument, context: InvoicePdfContext): void;
}
