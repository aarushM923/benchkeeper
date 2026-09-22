"use client";

import { useActionState, useState } from "react";
import type { AdoptFormState } from "@/app/benches/[code]/adopt/actions";
import { DEDICATION_MAX, DURATION_OPTIONS, NAME_MAX } from "@/lib/adopt";
import { addMonths, displayDay, lastCoveredDay, parseDay } from "@/lib/dates";

type Action = (prev: AdoptFormState, formData: FormData) => Promise<AdoptFormState>;

const input = "w-full rounded border border-stone-300 px-3 py-2 aria-[invalid=true]:border-red-600";

function FieldError({ id, text }: { id: string; text?: string }) {
  return text ? (
    <p id={id} className="text-sm text-red-700">
      {text}
    </p>
  ) : null;
}

export function AdoptForm({ action, today }: { action: Action; today: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = state.values;
  const e = state.errors ?? {};
  const [months, setMonths] = useState(v?.months ?? "12");
  const [dedication, setDedication] = useState(v?.dedication ?? "");

  const start = parseDay(today);
  const through = displayDay(lastCoveredDay(addMonths(start, Number(months) || 12)));

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.message && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-red-900">
          {state.message}
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="displayName" className="font-medium">
          Name to display
        </label>
        <p className="text-sm text-stone-500">
          Shown publicly on this bench&apos;s page — e.g. “The Rivera Family”.
        </p>
        <input
          id="displayName"
          name="displayName"
          required
          maxLength={NAME_MAX}
          defaultValue={v?.displayName}
          aria-invalid={Boolean(e.displayName)}
          aria-describedby="displayName-error"
          className={input}
        />
        <FieldError id="displayName-error" text={e.displayName} />
      </div>

      <div className="space-y-1">
        <label htmlFor="email" className="font-medium">
          Email
        </label>
        <p className="text-sm text-stone-500">
          For park staff only. Never shown publicly.
        </p>
        <input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={v?.email}
          aria-invalid={Boolean(e.email)}
          aria-describedby="email-error"
          className={input}
        />
        <FieldError id="email-error" text={e.email} />
      </div>

      <div className="space-y-1">
        <label htmlFor="dedication" className="font-medium">
          Dedication <span className="font-normal text-stone-500">(optional)</span>
        </label>
        <textarea
          id="dedication"
          name="dedication"
          rows={2}
          maxLength={DEDICATION_MAX}
          value={dedication}
          onChange={(ev) => setDedication(ev.target.value)}
          aria-invalid={Boolean(e.dedication)}
          aria-describedby="dedication-error"
          className={input}
        />
        <p className="text-right text-xs text-stone-500">
          {dedication.length}/{DEDICATION_MAX}
        </p>
        <FieldError id="dedication-error" text={e.dedication} />
      </div>

      <fieldset className="space-y-2">
        <legend className="font-medium">Adoption length</legend>
        <div className="flex flex-wrap gap-2">
          {DURATION_OPTIONS.map((o) => (
            <label
              key={o.months}
              className="flex cursor-pointer items-center gap-2 rounded border border-stone-300 px-3 py-2 has-[:checked]:border-green-700 has-[:checked]:bg-green-50"
            >
              <input
                type="radio"
                name="months"
                value={o.months}
                checked={months === String(o.months)}
                onChange={() => setMonths(String(o.months))}
              />
              {o.label}
            </label>
          ))}
        </div>
        <p className="text-sm text-stone-600">
          Starts today ({displayDay(start)}) and runs through <strong>{through}</strong>.
        </p>
        <FieldError id="months-error" text={e.months} />
      </fieldset>

      <button
        disabled={pending}
        className="rounded bg-green-800 px-5 py-2.5 font-medium text-white hover:bg-green-900 disabled:opacity-60"
      >
        {pending ? "Adopting…" : "Adopt this bench"}
      </button>
      <p className="text-xs text-stone-500">No payment is taken.</p>
    </form>
  );
}
