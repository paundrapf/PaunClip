"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Play } from "lucide-react";

import { cx } from "@/lib/utils";
import type { TextStyleConfig } from "@/lib/text-styles";
import { SurfaceCard } from "@/components/common/surface-card";

interface TextStylePreviewProps {
  style: TextStyleConfig;
  sampleText?: string;
  className?: string;
}

const POSITION_CLASSES: Record<TextStyleConfig["position"], string> = {
  "bottom-center": "items-end justify-center pb-10 sm:pb-14",
  "bottom-left": "items-end justify-start pb-10 pl-4 sm:pb-14 sm:pl-8",
  "bottom-right": "items-end justify-end pb-10 pr-4 sm:pb-14 sm:pr-8",
  center: "items-center justify-center",
};

export function TextStylePreview({
  style,
  sampleText = "Your caption text here",
  className,
}: TextStylePreviewProps) {
  const [playKey, setPlayKey] = useState(0);

  const handlePlay = useCallback(() => {
    setPlayKey((k) => k + 1);
  }, []);

  const getWordDelay = (index: number, totalWords: number) => {
    if (style.timing === "all-at-once") return "0s";
    if (style.timing === "line-by-line") {
      const wordsPerLine = Math.max(1, Math.ceil(totalWords / 2));
      const lineIndex = Math.floor(index / wordsPerLine);
      return `${lineIndex * 0.35}s`;
    }
    return `${index * 0.12}s`;
  };

  const wrapperVars = {
    "--preview-primary": style.primaryColor,
    "--preview-accent": style.accentColor,
    "--preview-stroke": `${style.strokeWidth}px ${style.strokeColor}`,
    "--preview-font": style.fontFamily,
  } as React.CSSProperties;

  const renderAnimatedText = () => {
    if (style.animation === "typewriter") {
      return (
        <div className="inline-block overflow-hidden" style={wrapperVars}>
          <span
            className={cx(
              "inline-block whitespace-nowrap text-2xl font-black uppercase tracking-tight sm:text-3xl md:text-4xl",
              "animate-typewriter",
              "text-[var(--preview-primary)]",
              "[font-family:var(--preview-font)]",
              "[-webkit-text-stroke:var(--preview-stroke)]",
            )}
            style={{ animationFillMode: "forwards" }}
          >
            {sampleText}
          </span>
        </div>
      );
    }

    const words = sampleText.split(" ");

    return (
      <div
        className="flex max-w-[85%] flex-wrap items-center justify-center gap-x-2 gap-y-1"
        style={{
          ...wrapperVars,
          textShadow: `0 4px 24px rgba(0,0,0,${style.shadowIntensity})`,
        }}
      >
        {words.map((word, i) => {
          const isAccent = words.length > 1 && i % 3 === 0;
          return (
            <span
              key={i}
              className={cx(
                "inline-block text-2xl font-black uppercase leading-tight tracking-tight sm:text-3xl md:text-4xl",
                `animate-${style.animation}`,
                isAccent
                  ? "text-[var(--preview-accent)]"
                  : "text-[var(--preview-primary)]",
                "[font-family:var(--preview-font)]",
                "[-webkit-text-stroke:var(--preview-stroke)]",
              )}
              style={{
                animationDelay: getWordDelay(i, words.length),
                animationFillMode: "both",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <SurfaceCard className="relative aspect-video overflow-hidden bg-panel-muted">
        <div
          key={playKey}
          className={cx(
            "flex h-full w-full",
            POSITION_CLASSES[style.position],
          )}
        >
          {renderAnimatedText()}
        </div>

        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={handlePlay}
          className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-black shadow-lg transition-colors hover:bg-accent/90"
          aria-label="Replay animation"
        >
          <Play className="h-5 w-5 fill-current" />
        </motion.button>
      </SurfaceCard>
    </div>
  );
}
