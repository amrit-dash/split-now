import type { ParsedPayment, ParsedReceipt } from './ocr-parse'

/** In-memory hand-off between the Scan screen and the expense/settle forms (survives SPA navigation). */
export const pending: {
  receipt?: { parsed: ParsedReceipt; file: File }
  payment?: { parsed: ParsedPayment; file: File }
} = {}
