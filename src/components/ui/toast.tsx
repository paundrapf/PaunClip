"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "warning" | "info";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type ToastInput = {
  type?: ToastType;
  title: string;
  description?: string;
  durationMs?: number;
  action?: ToastAction;
};

type Toast = ToastInput & {
  id: string;
  type: ToastType;
  durationMs: number;
};

type ToastContextValue = {
  notify: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const defaultDurations: Record<ToastType, number> = {
  success: 1800,
  info: 2400,
  warning: 4200,
  error: 5600,
};

const typeStyles: Record<
  ToastType,
  {
    icon: React.ComponentType<{ className?: string }>;
    shell: string;
    iconWrap: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    shell: "border-lime-400/50 bg-lime-950/80 text-lime-50",
    iconWrap: "bg-lime-400/15 text-lime-200",
  },
  error: {
    icon: AlertTriangle,
    shell: "border-red-400/50 bg-red-950/85 text-red-50",
    iconWrap: "bg-red-400/15 text-red-200",
  },
  warning: {
    icon: AlertTriangle,
    shell: "border-amber-400/50 bg-amber-950/85 text-amber-50",
    iconWrap: "bg-amber-400/15 text-amber-200",
  },
  info: {
    icon: Info,
    shell: "border-sky-400/45 bg-zinc-950/90 text-zinc-50",
    iconWrap: "bg-sky-400/15 text-sky-200",
  },
};

function createToastId() {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const timers = React.useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );

  const dismiss = React.useCallback((id: string) => {
    const timer = timers.current.get(id);

    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }

    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = React.useCallback(
    (input: ToastInput) => {
      const type = input.type ?? "info";
      const id = createToastId();
      const toast: Toast = {
        ...input,
        id,
        type,
        durationMs: input.durationMs ?? defaultDurations[type],
      };

      setToasts((current) => [toast, ...current].slice(0, 4));

      const timer = setTimeout(() => {
        dismiss(id);
      }, toast.durationMs);

      timers.current.set(id, timer);

      return id;
    },
    [dismiss],
  );

  React.useEffect(() => {
    const activeTimers = timers.current;

    return () => {
      for (const timer of activeTimers.values()) {
        clearTimeout(timer);
      }
      activeTimers.clear();
    };
  }, []);

  const value = React.useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions removals"
        className="pointer-events-none fixed right-4 top-4 z-[80] grid w-[min(380px,calc(100vw-2rem))] gap-3"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const style = typeStyles[toast.type];
  const Icon = style.icon;

  return (
    <div
      className={cn(
        "pointer-events-auto rounded-lg border p-3 shadow-2xl shadow-black/30 backdrop-blur",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2",
        style.shell,
      )}
      role={toast.type === "error" ? "alert" : "status"}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md",
            style.iconWrap,
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold">{toast.title}</p>
          {toast.description ? (
            <p className="mt-1 break-words text-xs leading-5 text-current/75">
              {toast.description}
            </p>
          ) : null}
          {toast.action ? (
            <button
              className="mt-2 text-xs font-semibold text-current underline underline-offset-4 hover:text-white"
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
        <button
          aria-label="Dismiss notification"
          className="rounded-md p-1 text-current/60 transition hover:bg-white/10 hover:text-current"
          type="button"
          onClick={() => onDismiss(toast.id)}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
