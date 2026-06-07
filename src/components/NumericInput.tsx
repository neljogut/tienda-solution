import React, { useState, useEffect } from 'react';

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
  onFocus,
  onBlur,
  ...props
}) => {
  const [focused, setFocused] = useState(false);
  const [inputValue, setInputValue] = useState('');

  // Keep inputValue in sync with value prop when not focused
  useEffect(() => {
    if (!focused) {
      if (value === '' || value === undefined || value === null) {
        setInputValue('');
      } else {
        // Format for display (Spanish style: 1.234,56 or 1.234)
        if (allowDecimals) {
          const parts = value.toString().split('.');
          const integerPart = Number(parts[0]).toLocaleString('es-AR');
          setInputValue(parts[1] !== undefined ? `${integerPart},${parts[1]}` : integerPart);
        } else {
          setInputValue(Math.round(value).toLocaleString('es-AR'));
        }
      }
    }
  }, [value, focused, allowDecimals]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    if (value === '' || value === undefined || value === null) {
      setInputValue('');
    } else {
      // When focusing, show the raw number without thousand separators
      // e.g., 60000 or 60000,50
      const numStr = value.toString();
      setInputValue(allowDecimals ? numStr.replace('.', ',') : numStr);
    }
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(false);
    onBlur?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;

    // Allow only digits and at most one decimal separator (comma or dot)
    if (allowDecimals) {
      // Replace dot with comma to normalize decimal separator for user typing
      raw = raw.replace(/\./g, ',');
      // Filter character: allow only digits and comma
      raw = raw.replace(/[^\d,]/g, '');
      // Ensure only one comma exists
      const parts = raw.split(',');
      if (parts.length > 2) {
        raw = parts[0] + ',' + parts.slice(1).join('');
      }
    } else {
      // Allow only digits
      raw = raw.replace(/\D/g, '');
    }

    setInputValue(raw);

    // Parse value to pass to onChange
    if (raw === '') {
      onChange('');
    } else {
      const parsed = allowDecimals
        ? parseFloat(raw.replace(',', '.'))
        : parseInt(raw, 10);
      onChange(isNaN(parsed) ? '' : parsed);
    }
  };

  return (
    <input
      type="text"
      inputMode={allowDecimals ? 'decimal' : 'numeric'}
      value={inputValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
      {...props}
    />
  );
};
