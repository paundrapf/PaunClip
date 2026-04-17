"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { ProgressProvider } from "@/components/progress/progress-provider";
import { getRouteDefinition } from "@/lib/navigation";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname() ?? "/";
  const route = getRouteDefinition(pathname);

  return (
    <ProgressProvider>
      <div className="min-h-screen lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <div className="flex min-h-screen flex-col">
          <AppTopbar route={route} />
          <main className="flex-1 px-4 pb-8 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </ProgressProvider>
  );
}
