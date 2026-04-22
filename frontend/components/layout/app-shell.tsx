"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { ProgressProvider } from "@/components/progress/progress-provider";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname() ?? "/";
  const [collapsed, setCollapsed] = useState(false);

  return (
    <ProgressProvider>
      <div className="min-h-screen bg-background">
        <AppSidebar
          pathname={pathname}
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
        />
        <div
          className="flex min-h-screen flex-col transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ paddingLeft: collapsed ? "5rem" : "18rem" }}
        >
          <AppTopbar />
          <main className="flex-1 px-4 pb-8 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </ProgressProvider>
  );
}
