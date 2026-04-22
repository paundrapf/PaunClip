import { WifiOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface OfflineBannerProps {
  isOffline: boolean;
  onRetry?: () => void;
}

export function OfflineBanner({ isOffline, onRetry }: OfflineBannerProps) {
  if (!isOffline) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-danger/10 px-4 py-3 text-danger",
        "border-danger/20",
      )}
      role="alert"
    >
      <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />

      <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium">
          Backend is offline. Some features may be unavailable.
        </p>

        {onRetry ? (
          <Button
            variant="danger"
            size="sm"
            onClick={onRetry}
            className="shrink-0"
          >
            Retry connection
          </Button>
        ) : null}
      </div>
    </div>
  );
}
