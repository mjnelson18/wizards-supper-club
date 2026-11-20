import type { WizardConfig } from './types.ts';

const norm = (s: string) => s.trim().toLowerCase();

/** Find a wizard by sheet name, display name or full name (case-insensitive). */
export function resolveWizard(name: string, wizards: WizardConfig[]): WizardConfig | undefined {
  const n = norm(name);
  if (!n) return undefined;
  return (
    wizards.find((w) => norm(w.sheetName) === n) ??
    wizards.find((w) => norm(w.displayName) === n) ??
    wizards.find((w) => norm(w.fullName) === n)
  );
}

/** Was this wizard a member during the given circuit? */
export function isMember(w: WizardConfig, circuit: number): boolean {
  return w.memberFrom <= circuit && (w.memberUntil === null || circuit <= w.memberUntil);
}
