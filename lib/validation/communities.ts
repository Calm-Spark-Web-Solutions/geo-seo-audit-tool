import { z } from "zod";

export const communityInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  website_url: z
    .string()
    .trim()
    .min(1, "Website URL is required")
    .max(500)
    .refine((v) => /^https?:\/\//.test(v), "Must be a valid URL"),
});

export type CommunityInput = z.infer<typeof communityInputSchema>;
