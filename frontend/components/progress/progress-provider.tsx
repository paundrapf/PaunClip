"use client";

import { useEffect, type ReactNode } from "react";

import { startProgressStream } from "@/lib/progress/progress-store";

interface ProgressProviderProps {
  children: ReactNode;
}

export function ProgressProvider({ children }: ProgressProviderProps) {
  useEffect(() => startProgressStream(), []);

  return <>{children}</>;
}
