"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings2, Check } from "lucide-react";

import { cx } from "@/lib/utils";
import { SurfaceCard } from "@/components/common/surface-card";
import {
  TEXT_STYLES,
  type TextStyleConfig,
  type TextCategory,
  type TextPosition,
  type TextTiming,
} from "@/lib/text-styles";

interface TextStyleSelectorProps {
  value?: TextStyleConfig;
  onChange?: (style: TextStyleConfig) => void;
  className?: string;
}

const CATEGORIES: TextCategory[] = ["Basic", "Viral", "Gaming", "Professional"];

const CATEGORY_STYLES: Record<
  TextCategory,
  { border: string; bg: string; text: string }
> = {
  Basic: {
    border: "border-white/10",
    bg: "bg-white/6",
    text: "text-foreground-soft",
  },
  Viral: {
    border: "border-accent/30",
    bg: "bg-accent/12",
    text: "text-accent",
  },
  Gaming: {
    border: "border-danger/30",
    bg: "bg-danger/12",
    text: "text-danger",
  },
  Professional: {
    border: "border-brand/30",
    bg: "bg-brand/12",
    text: "text-brand",
  },
};

const FONT_OPTIONS = [
  { label: "Impact", value: "Impact, Arial Black, sans-serif" },
  { label: "Montserrat Black", value: "Montserrat, sans-serif" },
  { label: "Arial Black", value: "Arial Black, sans-serif" },
  { label: "Inter", value: "Inter, sans-serif" },
];

const POSITION_OPTIONS: { label: string; value: TextPosition }[] = [
  { label: "Bottom Center", value: "bottom-center" },
  { label: "Bottom Left", value: "bottom-left" },
  { label: "Bottom Right", value: "bottom-right" },
  { label: "Center", value: "center" },
];

const TIMING_OPTIONS: { label: string; value: TextTiming }[] = [
  { label: "Word by Word", value: "word-by-word" },
  { label: "Line by Line", value: "line-by-line" },
  { label: "All at Once", value: "all-at-once" },
];

export function TextStyleSelector({
  value,
  onChange,
  className,
}: TextStyleSelectorProps) {
  const [internalStyle, setInternalStyle] = useState<TextStyleConfig | null>(
    value ?? null,
  );
  const [activeCategory, setActiveCategory] = useState<TextCategory | "All">(
    "All",
  );

  const selectedStyle = value ?? internalStyle;

  const handleSelect = useCallback(
    (style: TextStyleConfig) => {
      if (value === undefined) {
        setInternalStyle(style);
      }
      onChange?.(style);
    },
    [onChange, value],
  );

  const handleConfigChange = useCallback(
    <K extends keyof TextStyleConfig>(
      key: K,
      val: TextStyleConfig[K],
    ) => {
      const base = selectedStyle;
      if (!base) return;
      const next = { ...base, [key]: val } as TextStyleConfig;
      if (value === undefined) {
        setInternalStyle(next);
      }
      onChange?.(next);
    },
    [onChange, value, selectedStyle],
  );

  const filteredStyles = useMemo(() => {
    if (activeCategory === "All") return TEXT_STYLES;
    return TEXT_STYLES.filter((s) => s.category === activeCategory);
  }, [activeCategory]);

  return (
    <div className={cx("flex flex-col gap-6", className)}>
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory("All")}
          className={cx(
            "rounded-pill border px-4 py-1.5 text-xs font-semibold tracking-wide uppercase transition-colors",
            activeCategory === "All"
              ? "border-accent bg-accent/15 text-accent"
              : "border-white/10 bg-white/5 text-muted hover:bg-white/10 hover:text-foreground-soft",
          )}
        >
          All
        </button>
        {CATEGORIES.map((cat) => {
          const catStyle = CATEGORY_STYLES[cat];
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cx(
                "rounded-pill border px-4 py-1.5 text-xs font-semibold tracking-wide uppercase transition-colors",
                isActive
                  ? cx(catStyle.border, catStyle.bg, catStyle.text)
                  : "border-white/10 bg-white/5 text-muted hover:bg-white/10 hover:text-foreground-soft",
              )}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Style Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filteredStyles.map((style) => {
            const isSelected = selectedStyle?.id === style.id;
            const catStyle = CATEGORY_STYLES[style.category];
            return (
              <motion.button
                key={style.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                transition={{
                  duration: 0.2,
                  ease: [0.22, 1, 0.36, 1],
                }}
                onClick={() => handleSelect(style)}
                className={cx(
                  "relative flex flex-col gap-3 rounded-card border p-4 text-left transition-colors",
                  "bg-panel/80 backdrop-blur-sm",
                  isSelected
                    ? "border-accent ring-1 ring-accent/20"
                    : "border-stroke hover:border-white/15 hover:bg-panel",
                )}
              >
                {isSelected && (
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-black">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}

                {/* Mini Preview */}
                <div className="flex h-24 items-center justify-center overflow-hidden rounded-xl bg-panel-muted">
                  <span
                    className={cx(
                      "inline-block text-lg font-black uppercase tracking-tight",
                      style.animation === "typewriter" &&
                        "overflow-hidden whitespace-nowrap",
                      "text-foreground",
                    )}
                    style={{
                      fontFamily: style.fontFamily,
                      WebkitTextStroke: `${Math.max(1, style.strokeWidth * 0.5)}px ${style.strokeColor}`,
                      animation: `${style.animation} 1.4s cubic-bezier(0.22, 1, 0.36, 1) infinite alternate`,
                      animationDelay: "0.2s",
                    }}
                  >
                    {style.name}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {style.name}
                  </span>
                  <span
                    className={cx(
                      "shrink-0 rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      catStyle.border,
                      catStyle.bg,
                      catStyle.text,
                    )}
                  >
                    {style.category}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Config Panel */}
      <AnimatePresence>
        {selectedStyle && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{
              duration: 0.25,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <SurfaceCard>
              <div className="flex items-center gap-2 pb-5">
                <Settings2 className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold text-foreground">
                  Style Configuration
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* Font Family */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted">
                    Font Family
                  </label>
                  <select
                    value={selectedStyle.fontFamily}
                    onChange={(e) =>
                      handleConfigChange("fontFamily", e.target.value)
                    }
                    className="rounded-lg border border-stroke bg-panel-muted px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Primary Color */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted">
                    Primary Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={selectedStyle.primaryColor}
                      onChange={(e) =>
                        handleConfigChange("primaryColor", e.target.value)
                      }
                      className="h-9 w-9 cursor-pointer rounded-lg border border-stroke bg-transparent p-0.5"
                    />
                    <span className="font-mono text-xs text-muted">
                      {selectedStyle.primaryColor}
                    </span>
                  </div>
                </div>

                {/* Accent Color */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted">
                    Accent Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={selectedStyle.accentColor}
                      onChange={(e) =>
                        handleConfigChange("accentColor", e.target.value)
                      }
                      className="h-9 w-9 cursor-pointer rounded-lg border border-stroke bg-transparent p-0.5"
                    />
                    <span className="font-mono text-xs text-muted">
                      {selectedStyle.accentColor}
                    </span>
                  </div>
                </div>

                {/* Stroke Width */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted">
                    Stroke Width
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={2}
                      max={8}
                      step={1}
                      value={selectedStyle.strokeWidth}
                      onChange={(e) =>
                        handleConfigChange(
                          "strokeWidth",
                          Number(e.target.value),
                        )
                      }
                      className="flex-1 accent-accent"
                    />
                    <span className="w-8 text-right font-mono text-xs text-muted">
                      {selectedStyle.strokeWidth}px
                    </span>
                  </div>
                </div>

                {/* Position */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted">
                    Position
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {POSITION_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() =>
                          handleConfigChange("position", opt.value)
                        }
                        className={cx(
                          "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                          selectedStyle.position === opt.value
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-stroke bg-panel-muted text-muted hover:border-white/15 hover:text-foreground-soft",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Timing */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted">
                    Timing
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {TIMING_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() =>
                          handleConfigChange("timing", opt.value)
                        }
                        className={cx(
                          "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                          selectedStyle.timing === opt.value
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-stroke bg-panel-muted text-muted hover:border-white/15 hover:text-foreground-soft",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </SurfaceCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
