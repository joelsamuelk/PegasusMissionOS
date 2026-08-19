export type EmailKind = "transactional" | "personal" | "outreach";
export interface EmailAction { label: string; url: string }
export interface EmailSection { heading?: string; paragraphs: string[]; items?: string[] }
export interface PersonalSignature {
  name: string; role: string; organisation?: string; email: string;
  phone?: string; website?: string; location?: string;
}
export interface ComplianceFooter {
  organisationName: string; postalAddress: string; unsubscribeUrl: string;
  contactSource?: string;
}
export interface PegasusEmailInput {
  kind: EmailKind; subject: string; preheader: string; title: string;
  greeting?: string; sections: EmailSection[]; action?: EmailAction;
  closing?: string; signature?: PersonalSignature; compliance?: ComplianceFooter;
}
export interface RenderedEmail { subject: string; html: string; text: string }
