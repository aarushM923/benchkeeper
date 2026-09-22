"use server";

import { redirect } from "next/navigation";
import { createAdoption, validateAdoption, type AdoptionField } from "@/lib/adopt";
import { today } from "@/lib/dates";
import { prisma } from "@/lib/db";

export interface AdoptFormState {
  /** Form-level error, e.g. the bench was adopted by someone else. */
  message?: string;
  errors?: Partial<Record<AdoptionField, string>>;
  /** What the visitor typed, so the form can be re-filled after an error. */
  values?: Record<AdoptionField, string>;
}

/**
 * Server Action behind the adopt form. Everything is re-validated here — the
 * form's own constraints are a convenience, not a guarantee — and the start
 * date is always the server's "today", never anything from the client.
 */
export async function adoptBench(
  benchCode: string,
  _prev: AdoptFormState,
  formData: FormData,
): Promise<AdoptFormState> {
  const raw = {
    displayName: String(formData.get("displayName") ?? ""),
    email: String(formData.get("email") ?? ""),
    dedication: String(formData.get("dedication") ?? ""),
    months: String(formData.get("months") ?? ""),
  };

  const validated = validateAdoption(raw);
  if (!validated.ok) return { errors: validated.errors, values: raw };

  const result = await createAdoption(prisma, benchCode, validated.value, today());
  if (!result.ok) return { message: result.message, values: raw };

  redirect(`/benches/${encodeURIComponent(benchCode)}?adopted=1`);
}
