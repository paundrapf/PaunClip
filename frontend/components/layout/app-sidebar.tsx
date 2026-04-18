"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";

import { GlobalProgressWidget } from "@/components/progress/global-progress-widget";
import { getApiHostLabel } from "@/lib/config";
import { SIDEBAR_ROUTES } from "@/lib/navigation";
import { cx } from "@/lib/utils";

interface AppSidebarProps {
  pathname: string;
}

export function AppSidebar({ pathname }: AppSidebarProps) {
  return (
    <aside className="border-b border-stroke/80 bg-background/70 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col gap-6 px-4 py-4 sm:px-6 lg:px-5 lg:py-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center overflow-hidden rounded-card border border-stroke-strong bg-accent/10 shadow-[0_0_24px_rgba(36,209,255,0.2)]">
              <Image
                src="/branding/paunclip-logo.png"
                alt="PaunClip logo"
                width={44}
                height={44}
                className="size-full object-contain"
                priority
              />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-foreground">PaunClip</p>
              <p className="text-xs text-muted">Clip engine, queue, and workspace</p>
            </div>
          </Link>
        </div>

        <Link
          href="/manual"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border border-stroke-strong bg-brand/15 px-4 text-sm font-semibold text-foreground transition hover:border-accent/50 hover:bg-accent/12"
        >
          <Plus className="size-4" />
          Manual Session
        </Link>

        <nav className="grid gap-6">
          {[
            { label: "Operations", group: "operations" as const },
            { label: "Support", group: "support" as const },
          ].map((group) => (
            <div key={group.group} className="space-y-2">
              <p className="px-2 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-muted">
                {group.label}
              </p>
              <div className="grid gap-1.5">
                {SIDEBAR_ROUTES.filter((route) => route.group === group.group).map((route) => {
                  const active = route.href === "/"
                    ? pathname === route.href
                    : pathname === route.href || pathname.startsWith(`${route.href}/`);
                  const Icon = route.icon;

                  return (
                    <Link
                      key={route.key}
                      href={route.href}
                      className={cx(
                        "group flex min-h-11 items-center gap-3 rounded-card border px-3.5 py-3 text-sm transition",
                        active
                          ? "border-stroke-strong bg-accent/12 text-foreground"
                          : "border-transparent text-muted hover:border-stroke hover:bg-panel-muted hover:text-foreground-soft",
                      )}
                    >
                      <Icon className={cx("size-4 shrink-0", active ? "text-accent" : "text-muted group-hover:text-accent")} />
                      <span className="font-medium">{route.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          <GlobalProgressWidget />
          <div className="rounded-card border border-stroke bg-panel-muted px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">API base</p>
            <p className="mt-2 text-sm text-foreground-soft">{getApiHostLabel()}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
