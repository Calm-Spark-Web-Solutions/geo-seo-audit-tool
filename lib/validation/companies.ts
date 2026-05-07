import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .nullable();

export const companyInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  contact_name: optionalText(120),
  contact_email: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .nullable()
    .refine(
      (v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Must be a valid email",
    ),
});

export type CompanyInput = z.infer<typeof companyInputSchema>;
