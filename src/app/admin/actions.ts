"use server";

// Every action re-checks admin auth itself: a Server Action is a public POST
// endpoint, whatever page its form happens to be rendered on.

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  cancelAdoption,
  createBench,
  setBenchActive,
  updateAdoption,
  updateBench,
  type BenchInput,
} from "@/lib/admin";
import { checkPassword, endSession, requireAdmin, startSession } from "@/lib/auth";
import { today } from "@/lib/dates";
import { prisma } from "@/lib/db";

export interface AdminFormState {
  error?: string;
  success?: string;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function login(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  if (!checkPassword(str(fd, "password"))) {
    // Slow down guessing a little. Real rate limiting is out of scope (README).
    await new Promise((r) => setTimeout(r, 750));
    return { error: "Incorrect password." };
  }
  await startSession();
  redirect("/admin");
}

export async function logout() {
  await endSession();
  redirect("/admin/login");
}

export async function editAdoption(id: string, _prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  await requireAdmin();
  const r = await updateAdoption(prisma, id, {
    endDate: str(fd, "endDate"),
    dedication: str(fd, "dedication"),
  });
  if (!r.ok) return { error: r.message };
  refresh();
  return { success: "Saved." };
}

export async function cancelAdoptionAction(id: string): Promise<AdminFormState> {
  await requireAdmin();
  const r = await cancelAdoption(prisma, id);
  if (!r.ok) return { error: r.message };
  refresh();
  return { success: "Adoption cancelled. The bench's status updates immediately." };
}

function benchInput(fd: FormData): BenchInput {
  return {
    code: str(fd, "code"),
    zone: str(fd, "zone"),
    material: str(fd, "material"),
    installedYear: str(fd, "installedYear"),
    notes: str(fd, "notes"),
  };
}

export async function createBenchAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  await requireAdmin();
  const r = await createBench(prisma, benchInput(fd));
  if (!r.ok) return { error: r.message };
  redirect(`/admin/benches/${r.code}`);
}

export async function updateBenchAction(code: string, _prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  await requireAdmin();
  const r = await updateBench(prisma, code, benchInput(fd));
  if (!r.ok) return { error: r.message };
  refresh();
  return { success: "Saved." };
}

export async function setBenchActiveAction(
  code: string,
  active: boolean,
): Promise<AdminFormState> {
  await requireAdmin();
  const r = await setBenchActive(prisma, code, active, today());
  if (!r.ok) return { error: r.message };
  refresh();
  return { success: active ? "Bench restored." : "Bench retired. It no longer appears publicly." };
}
