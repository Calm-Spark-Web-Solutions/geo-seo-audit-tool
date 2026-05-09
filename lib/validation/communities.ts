import { z } from "zod";

import { isFacilityType } from "@/lib/facility-types";

export const communityInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  website_url: z
    .string()
    .trim()
    .min(1, "Website URL is required")
    .max(500)
    .refine((v) => /^https?:\/\//.test(v), "Must be a valid URL"),
  facility_type: z
    .string()
    .optional()
    .transform((s) =>
      s == null || typeof s !== "string" ? null : s.trim() === "" ? null : s.trim(),
    )
    .refine((v) => v === null || isFacilityType(v), {
      message: "Select a valid facility type.",
    }),
});

export type CommunityInput = z.infer<typeof communityInputSchema>;
