import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import {
  Film,
  Folder,
  Home,
  LayoutGrid,
  Link2,
  Settings
} from "lucide-react";
import { APP_NAME } from "@/shared/constants/app";
import { BRAND_ASSETS } from "@/shared/constants/brand";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/projects", label: "Projects", icon: LayoutGrid },
  { href: "/campaigns", label: "Campaigns", icon: Folder },
  { href: "/workflow", label: "Workflow", icon: Film },
  { href: "/settings", label: "Settings", icon: Settings }
] as const;

export function AppShell({ children, active = "/" }: { children: React.ReactNode; active?: string }) {
  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--bg)] text-[var(--text)]">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-[72px] flex-col border-r border-[var(--border)] bg-[rgb(12_12_10_/_0.82)] px-3 py-5 shadow-[10px_0_40px_rgb(0_0_0_/_0.22)] backdrop-blur-xl">
        <Link
          href="/"
          className="mb-8 flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--panel-raised)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.05)] transition hover:border-[var(--accent)]/70"
          aria-label={`${APP_NAME} home`}
        >
          <Image
            src={BRAND_ASSETS.logoTransparent}
            alt={APP_NAME}
            width={34}
            height={34}
            className="h-8 w-8 object-contain"
            priority
          />
        </Link>
        <nav className="grid gap-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.href || (item.href !== "/" && active.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href as Route}
                aria-label={item.label}
                title={item.label}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-lg text-[var(--muted-soft)] transition-[background,color,border-color,box-shadow,transform] duration-200 hover:bg-[var(--panel-soft)] hover:text-[var(--text)]",
                  isActive &&
                    "bg-[var(--accent-muted)] text-[var(--accent-strong)] shadow-[inset_0_0_0_1px_rgb(242_162_58_/_0.28)]"
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto grid gap-3">
          <Link
            href="/settings"
            aria-label="Integrations"
            title="Integrations"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--muted-soft)] transition hover:bg-[var(--panel-soft)] hover:text-[var(--text)]"
          >
            <Link2 className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </aside>
      <main className="min-h-screen min-w-0 max-w-full overflow-x-clip pl-[72px]">{children}</main>
    </div>
  );
}
