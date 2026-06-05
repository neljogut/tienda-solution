import React from 'react';
import { NumericInput } from './NumericInput';
import { combinePrintMinutes, splitPrintMinutes } from '../utils/printTime';

interface TimeHoursMinutesInputProps {
  valueMinutes: number | '' | undefined;
  onChangeMinutes: (minutes: number | '') => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  onBlur?: () => void;
}

export const TimeHoursMinutesInput: React.FC<TimeHoursMinutesInputProps> = ({
  valueMinutes,
  onChangeMinutes,
  label,
  required = false,
  disabled = false,
  compact = false,
  className = '',
  onBlur,
}) => {
  const total =
    valueMinutes === '' || valueMinutes === undefined
      ? null
      : Math.max(0, Math.round(Number(valueMinutes)));

  const hours: number | '' = total === null ? '' : splitPrintMinutes(total).hours;
  const minutes: number | '' = total === null ? '' : splitPrintMinutes(total).minutes;

  const emitFromParts = (newHours: number | '', newMinutes: number | '') => {
    if (newHours === '' && newMinutes === '') {
      onChangeMinutes(required ? 0 : '');
      return;
    }

    let h = newHours === '' ? 0 : Math.max(0, Math.round(Number(newHours)));
    let m = newMinutes === '' ? 0 : Math.max(0, Math.round(Number(newMinutes)));

    if (m >= 60) {
      h += Math.floor(m / 60);
      m = m % 60;
    }

    onChangeMinutes(combinePrintMinutes(h, m));
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
          value={hours}
          onChange={(val) => emitFromParts(val, minutes)}
          disabled={disabled}
          placeholder="0"
          aria-label="Horas"
        />
        <span className={`text-slate-500 shrink-0 ${compact ? 'text-[10px]' : 'text-xs'}`}>h</span>
        <NumericInput
          className={`${inputClass} ${compact ? 'w-16' : 'w-24'}`}
          value={minutes}
          onChange={(val) => emitFromParts(hours, val)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder="0"
          aria-label="Minutos"
        />
        <span className={`text-slate-500 shrink-0 ${compact ? 'text-[10px]' : 'text-xs'}`}>min</span>
      </div>
    </div>
  );
};
