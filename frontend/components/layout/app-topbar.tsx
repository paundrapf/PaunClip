"use client";

import { motion } from "framer-motion";
import { useProgress } from "@/hooks/use-progress";

export function AppTopbar() {
  const { connection, data } = useProgress();

  const statusColor =
    connection === "offline"
      ? "bg-danger"
      : data.is_running
        ? "bg-warning"
        : "bg-success";

  const statusLabel =
    connection === "offline"
      ? "Offline"
      : data.is_running
        ? "Processing"
        : "Online";

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-stroke/80 bg-background/70 px-6 backdrop-blur-xl">
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          PaunClip
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <motion.div
          className="relative flex size-2.5 items-center justify-center"
          initial={false}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <span className={"absolute inline-flex size-full animate-ping rounded-full opacity-40 " + statusColor} />
          <span className={"relative inline-flex size-2 rounded-full " + statusColor} />
        </motion.div>
        <span className="text-xs font-medium text-muted">{statusLabel}</span>
      </div>
    </header>
  );
}
