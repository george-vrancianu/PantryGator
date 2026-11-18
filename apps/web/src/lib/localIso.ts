const pad = (n: number) => String(n).padStart(2, '0');

/** A Date as the Member's local calendar day, `YYYY-MM-DD`. Lives here, not in `pantry.ts`, so `recipes.ts` can use it without an import cycle. */
export function localIso(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
