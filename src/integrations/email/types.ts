export interface InvoiceEmailPayload {
  to: string;
  customerName: string;
  invoiceNumber: string;
  amount: string;
  currency: string;
  dueDate: string;
  companyName: string;
  viewUrl?: string;
}

export interface EmailSendResult {
  sent: boolean;
  provider: string;
}

export interface EmailProvider {
  readonly name: string;
  isConfigured(): boolean;
  sendInvoiceEmail(payload: InvoiceEmailPayload): Promise<EmailSendResult>;
}
