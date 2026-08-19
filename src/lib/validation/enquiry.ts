import { z } from "zod";

export const ENQUIRY_TOPICS = [
  "See a guided walkthrough",
  "Discuss our funding pipeline",
  "Migrate from spreadsheets",
  "Something else",
] as const;

export const enquirySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please tell us your name.")
    .max(120, "That name is too long."),
  email: z
    .string()
    .trim()
    .min(1, "Please add an email address.")
    .email("That does not look like a valid email address."),
  organisation: z
    .string()
    .trim()
    .min(2, "Please tell us which organisation you are with.")
    .max(160, "That organisation name is too long."),
  topic: z.enum(ENQUIRY_TOPICS, {
    errorMap: () => ({ message: "Please choose what you would like to talk about." }),
  }),
  message: z
    .string()
    .trim()
    .min(10, "Please add a little more detail (at least 10 characters).")
    .max(2000, "Please keep this under 2000 characters."),
});

export type Enquiry = z.infer<typeof enquirySchema>;

export type EnquiryState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Field-level errors, keyed by field name. */
  errors?: Partial<Record<keyof Enquiry, string>>;
};

export const initialEnquiryState: EnquiryState = { status: "idle" };
