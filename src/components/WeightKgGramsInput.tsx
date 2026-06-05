import React from 'react';
import { NumericInput } from './NumericInput';
import { combineWeightGrams, splitWeightGrams } from '../utils/weightGrams';

interface WeightKgGramsInputProps {
  valueGrams: number | '' | undefined;
  onChangeGrams: (grams: number | '') => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  onBlur?: () => void;
}

export const WeightKgGramsInput: React.FC<WeightKgGramsInputProps> = ({
  valueGrams,
  onChangeGrams,
  label,
  required = false,
  disabled = false,
  compact = false,
  className = '',
  onBlur,
}) => {
  const total =
    valueGrams === '' || valueGrams === undefined
      ? null
      : Math.max(0, Math.round(Number(valueGrams)));

  const kg: number | '' = total === null ? '' : splitWeightGrams(total).kg;
  const g: number | '' = total === null ? '' : splitWeightGrams(total).g;

  const emitFromParts = (newKg: number | '', newG: number | '') => {
    if (newKg === '' && newG === '') {
      onChangeGrams(required ? 0 : '');
      return;
    }

    let k = newKg === '' ? 0 : Math.max(0, Math.round(Number(newKg)));
    let gr = newG === '' ? 0 : Math.max(0, Math.round(Number(newG)));

    if (gr >= 1000) {
      k += Math.floor(gr / 1000);
      gr = gr % 1000;
    }

    onChangeGrams(combineWeightGrams(k, gr));
  };

  const inputClass = compact
    ? 'input text-xs py-1.5 text-right'
    : 'input w-full mt-1 text-right';

  return (
    <div className={className}>
      {label && (
        <label className="input-label font-bold text-slate-500 uppercase">{label}</label>
      )}
      <div className={`flex items-center gap-1.5 ${label ? 'mt-1' : ''} ${compact ? 'justify-end' : ''}`}>
        <NumericInput
          className={`${inputClass} ${compact ? 'w-14' : 'w-24'}`}
          value={kg}
          onChange={(val) => emitFromParts(val, g)}
          disabled={disabled}
          placeholder="0"
          aria-label="Kilogramos"
        />
        <span className={`text-slate-500 shrink-0 ${compact ? 'text-[10px]' : 'text-xs'}`}>kg</span>
        <NumericInput
          className={`${inputClass} ${compact ? 'w-16' : 'w-24'}`}
          value={g}
          onChange={(val) => emitFromParts(kg, val)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder="0"
          aria-label="Gramos"
        />
        <span className={`text-slate-500 shrink-0 ${compact ? 'text-[10px]' : 'text-xs'}`}>g</span>
      </div>
    </div>
  );
};
