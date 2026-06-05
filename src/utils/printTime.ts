export function splitPrintMinutes(totalMinutes: number): { hours: number; minutes: number } {
  const total = Math.max(0, Math.round(totalMinutes));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

export function combinePrintMinutes(hours: number | '', minutes: number | ''): number {
  const h = hours === '' ? 0 : Math.max(0, Math.round(Number(hours)));
  const m = minutes === '' ? 0 : Math.max(0, Math.round(Number(minutes)));
  return h * 60 + m;
}

/** Ej: 428 → "7 h 8 min", 45 → "45 min", 120 → "2 h" */
export function formatPrintTime(totalMinutes: number): string {
  const { hours, minutes } = splitPrintMinutes(totalMinutes);
  if (hours === 0 && minutes === 0) return '0 min';
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}
