"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  placeholder?: string;
}

export function Select({
  label,
  value,
  onChange,
  options,
  disabled = false,
  placeholder = "Select an option",
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="flex flex-col gap-1.5">
      {label ? (
        <label className="text-sm font-medium text-foreground-soft">
          {label}
        </label>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          "relative flex h-10 w-full items-center justify-between rounded-lg border bg-panel px-3 text-sm shadow-sm transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isOpen ? "border-accent ring-2 ring-accent/40" : "border-stroke",
        )}
      >
        <span
          className={cn(
            selectedOption ? "text-foreground" : "text-muted",
          )}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition-transform",
            isOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen ? (
        <ul
          role="listbox"
          className={cn(
            "z-50 max-h-60 w-full overflow-auto rounded-lg border border-stroke bg-panel shadow-lg",
            "py-1",
          )}
        >
          {options.map((option) => (
            <li key={option.value} role="option" aria-selected={option.value === value}>
              <button
                type="button"
                onClick={() => handleSelect(option.value)}
                className={cn(
                  "flex w-full items-center px-3 py-2 text-sm transition-colors",
                  option.value === value
                    ? "bg-accent/10 text-accent"
                    : "text-foreground hover:bg-panel-muted",
                )}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
