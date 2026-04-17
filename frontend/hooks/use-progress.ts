"use client";

import { useSyncExternalStore } from "react";

import {
  getProgressSnapshot,
  getServerProgressSnapshot,
  subscribeToProgress,
} from "@/lib/progress/progress-store";

export function useProgress() {
  return useSyncExternalStore(
    subscribeToProgress,
    getProgressSnapshot,
    getServerProgressSnapshot,
  );
}
