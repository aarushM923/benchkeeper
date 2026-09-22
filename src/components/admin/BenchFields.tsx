const input = "w-full rounded border border-stone-300 px-2 py-1.5";

export function BenchFields({
  zones,
  bench,
}: {
  zones: string[];
  bench?: { code: string; zone: string; material: string | null; installedYear: number | null; notes: string | null };
}) {
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      {!bench && (
        <label className="space-y-1">
          <span className="font-medium">Code</span>
          <input name="code" required placeholder="PG-111" className={`${input} font-mono uppercase`} />
        </label>
      )}
      <label className="space-y-1">
        <span className="font-medium">Zone</span>
        <input name="zone" required list="zones" defaultValue={bench?.zone} className={input} />
        <datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
      </label>
      <label className="space-y-1">
        <span className="font-medium">Material</span>
        <input name="material" defaultValue={bench?.material ?? ""} className={input} />
      </label>
      <label className="space-y-1">
        <span className="font-medium">Installed year</span>
        <input name="installedYear" inputMode="numeric" defaultValue={bench?.installedYear ?? ""} className={input} />
      </label>
      <label className="space-y-1 sm:col-span-2">
        <span className="font-medium">Notes (staff only)</span>
        <textarea name="notes" rows={2} maxLength={500} defaultValue={bench?.notes ?? ""} className={input} />
      </label>
    </div>
  );
}
