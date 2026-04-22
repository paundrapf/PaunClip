import type { ChangeEvent, InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface TextFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
  helperText?: string;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  error,
  type = "text",
  helperText,
}: TextFieldProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label className="text-sm font-medium text-foreground-soft">
          {label}
        </label>
      ) : null}

      <input
        type={type}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? "true" : "false"}
        className={cn(
          "h-10 w-full rounded-lg border bg-panel px-3 text-sm text-foreground shadow-sm transition-colors",
          "placeholder:text-muted",
          "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error
            ? "border-danger focus:border-danger focus:ring-danger/30"
            : "border-stroke",
        )}
      />

      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-muted">{helperText}</p>
      ) : null}
    </div>
  );
}
