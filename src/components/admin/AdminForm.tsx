"use client";

import { useActionState, type ReactNode } from "react";
import type { AdminFormState } from "@/app/admin/actions";

type Action = (prev: AdminFormState, fd: FormData) => Promise<AdminFormState>;

/** A form bound to an admin Server Action that shows its error/success message. */
export function AdminForm({
  action,
  submitLabel,
  children,
  danger = false,
  confirm,
  className = "space-y-3",
}: {
  action: Action;
  submitLabel: string;
  children?: ReactNode;
  danger?: boolean;
  confirm?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state.error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
          {state.success}
        </p>
      )}
      <button
        disabled={pending}
        className={`rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
          danger ? "bg-red-700 hover:bg-red-800" : "bg-green-800 hover:bg-green-900"
        }`}
      >
        {pending ? "Working…" : submitLabel}
      </button>
    </form>
  );
}
