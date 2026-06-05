export function splitWeightGrams(totalGrams: number): { kg: number; g: number } {
  const total = Math.max(0, Math.round(totalGrams));
  return { kg: Math.floor(total / 1000), g: total % 1000 };
}

export function combineWeightGrams(kg: number | '', g: number | ''): number {
  const k = kg === '' ? 0 : Math.max(0, Math.round(Number(kg)));
  const gr = g === '' ? 0 : Math.max(0, Math.round(Number(g)));
  return k * 1000 + gr;
}

/** Ej: 1100 → "1 kg 100 g", 500 → "500 g", 2000 → "2 kg" */
export function formatWeightGrams(totalGrams: number): string {
  const { kg, g } = splitWeightGrams(totalGrams);
  if (kg === 0 && g === 0) return '0 g';
  if (kg === 0) return `${g.toLocaleString('es-AR')} g`;
  if (g === 0) return `${kg.toLocaleString('es-AR')} kg`;
  return `${kg.toLocaleString('es-AR')} kg ${g.toLocaleString('es-AR')} g`;
}
