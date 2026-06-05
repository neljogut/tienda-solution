import React, { useRef, useState } from 'react';

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number | '' | undefined;
  onChange: (val: number | '') => void;
  allowDecimals?: boolean;
}

/** Convierte texto es-AR (1.234,56) a formato parseable (1234.56) */
function sanitizeDecimalRaw(input: string): string {
  let s = input.trim();
  if (!s) return '';

  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }

  s = s.replace(/[^\d.]/g, '');
  const parts = s.split('.');
  if (parts.length > 2) {
    s = parts[0] + '.' + parts.slice(1).join('');
  }
  return s;
}

function sanitizeIntegerRaw(input: string): string {
  return input.replace(/\./g, '').replace(/\D/g, '');
}

function formatDecimalDisplay(raw: string): string {
  if (!raw) return '';
  if (raw === '.') return '0,';

  const endsWithDot = raw.endsWith('.');
  const parts = raw.split('.');
  const intPart = parts[0] === '' ? '0' : parts[0];
  const formattedInt = Number(intPart).toLocaleString('es-AR');

  if (endsWithDot) return `${formattedInt},`;
  if (parts.length > 1) return `${formattedInt},${parts[1]}`;
  return formattedInt;
}

function parseDecimalValue(raw: string): number | '' {
  if (!raw || raw === '.') return '';
  if (raw.endsWith('.')) {
    const intPart = raw.slice(0, -1);
    return intPart === '' ? '' : Number(intPart);
  }
  const num = Number(raw);
  return Number.isNaN(num) ? '' : num;
}

function formatValue(num: number | '' | undefined, allowDecimals: boolean): string {
  if (num === '' || num === undefined || num === null) return '';

  if (allowDecimals) {
    const numStr = num.toString();
    const parts = numStr.split('.');
    const integerPart = Number(parts[0]).toLocaleString('es-AR');
    return parts[1] !== undefined ? `${integerPart},${parts[1]}` : integerPart;
  }

  return Math.round(Number(num)).toLocaleString('es-AR');
}

export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  allowDecimals = false,
  className = '',
  onFocus,
  onBlur,
  ...props
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  const displayValue = focused ? draft : formatValue(value, allowDecimals);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = allowDecimals
      ? sanitizeDecimalRaw(e.target.value)
      : sanitizeIntegerRaw(e.target.value);

    const display = allowDecimals ? formatDecimalDisplay(raw) : (
      raw === '' ? '' : Number(raw).toLocaleString('es-AR')
    );

    setDraft(display);

    const numericValue = allowDecimals
      ? parseDecimalValue(raw)
      : (raw === '' ? '' : Number(raw));

    const input = inputRef.current;
    const oldSelectionStart = input?.selectionStart || 0;
    const oldLength = input?.value.length || 0;

    onChange(numericValue);

    setTimeout(() => {
      if (input) {
        const newLength = input.value.length;
        const lengthDiff = newLength - oldLength;
        const newSelectionStart = Math.max(0, oldSelectionStart + lengthDiff);
        input.setSelectionRange(newSelectionStart, newSelectionStart);
      }
    }, 0);
  };

  return (
    <input
      type="text"
      inputMode={allowDecimals ? 'decimal' : 'numeric'}
      ref={inputRef}
      value={displayValue}
      onChange={handleInputChange}
      onFocus={(e) => {
        setFocused(true);
        setDraft(formatValue(value, allowDecimals));
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        setDraft('');
        onBlur?.(e);
      }}
      className={className}
      {...props}
    />
  );
};
