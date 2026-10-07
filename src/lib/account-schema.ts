import { z } from "zod";

/** Shared by the sign-up step and the account details form. */
export const profileSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  phone: z
    .string()
    .trim()
    .min(7, "Please enter a phone number I can reach you on.")
    .max(30)
    .regex(/^[+\d][\d\s()-]{6,}$/, "Please enter a valid phone number."),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter your date of birth.")
    .refine((v) => {
      const d = new Date(`${v}T12:00:00Z`);
      if (Number.isNaN(d.getTime())) return false;
      const age = (Date.now() - d.getTime()) / (365.25 * 86400_000);
      return age >= 13 && age <= 110;
    }, "Please check your date of birth."),
});
