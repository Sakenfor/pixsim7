import { useEffect, useRef, useState } from 'react';

interface InlineTextInputProps {
  initialValue?: string;
  placeholder?: string;
  className?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function InlineTextInput({
  initialValue = '',
  placeholder,
  className,
  onSubmit,
  onCancel,
}: InlineTextInputProps) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit();
        else if (e.key === 'Escape') onCancel();
      }}
      className={className}
    />
  );
}
