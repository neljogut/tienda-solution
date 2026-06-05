import React, { useRef } from 'react';

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number | '' | undefined;
  onChange: (val: number | '') => void;
  allowDecimals?: boolean;
}

export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  allowDecimals = false,
  className = '',
  ...props
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Format number to string with dots as thousands separator (and commas for decimals)
  const formatValue = (num: number | '' | undefined): string => {
    if (num === '' || num === undefined || num === null) return '';
    
    if (allowDecimals) {
      const numStr = num.toString();
      const parts = numStr.split('.');
      // Use local format for integer part
      const integerPart = Number(parts[0]).toLocaleString('es-AR');
      // If there was a decimal dot, return with comma
      return parts[1] !== undefined ? `${integerPart},${parts[1]}` : integerPart;
    }
    
    // For integer values, format with thousands separator dot
    return Math.round(Number(num)).toLocaleString('es-AR');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    
    // Normalize decimal separators (commas to dots)
    if (allowDecimals) {
      raw = raw.replace(/,/g, '.');
      // Keep only digits and a single dot
      raw = raw.replace(/[^\d.]/g, '');
      const parts = raw.split('.');
      if (parts.length > 2) {
        raw = parts[0] + '.' + parts.slice(1).join('');
      }
    } else {
      // Keep only digits
      raw = raw.replace(/\D/g, '');
    }

    const numericValue = raw === '' ? '' : Number(raw);
    
    // Capture cursor position before update
    const input = inputRef.current;
    const oldSelectionStart = input?.selectionStart || 0;
    const oldLength = input?.value.length || 0;

    onChange(numericValue);

    // Schedule cursor position restoration after React state update
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
      ref={inputRef}
      value={formatValue(value)}
      onChange={handleInputChange}
      className={className}
      {...props}
    />
  );
};
