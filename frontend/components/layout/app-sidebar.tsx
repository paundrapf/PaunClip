"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Clapperboard,
  PlaySquare,
  FolderKanban,
  LibraryBig,
  Settings,
  CircleHelp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { cx } from "@/lib/utils";

interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard },
  { key: "new-clip", href: "/manual", label: "New Clip", icon: Clapperboard },
  { key: "sessions", href: "/sessions", label: "Sessions", icon: PlaySquare },
  { key: "campaigns", href: "/campaigns", label: "Campaigns", icon: FolderKanban },
  { key: "library", href: "/library", label: "Library", icon: LibraryBig },
];

const SUPPORT_ITEMS: NavItem[] = [
  { key: "settings", href: "/settings", label: "Settings", icon: Settings },
  { key: "help", href: "/help", label: "Help", icon: CircleHelp },
];

interface AppSidebarProps {
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
}

function SidebarLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cx(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
        active
          ? "bg-accent/10 text-accent"
          : "text-muted hover:bg-panel-muted hover:text-foreground-soft",
      )}
    >
      <Icon
        className={cx(
          "size-5 shrink-0 transition-colors duration-200",
          active ? "text-accent" : "text-muted group-hover:text-foreground-soft",
        )}
      />
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="whitespace-nowrap"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-accent"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
    </Link>
  );
}

export function AppSidebar({ pathname, collapsed, onToggle }: AppSidebarProps) {
  const isActive = (href: string) =>
    href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside
      className={cx(
        "fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-stroke bg-panel/90 backdrop-blur-xl transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
      )}
      style={{ width: collapsed ? "5rem" : "18rem" }}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center justify-center">
          <div className="flex size-10 items-center justify-center overflow-hidden rounded-xl border border-stroke-strong bg-accent/10 shadow-[0_0_20px_rgba(36,209,255,0.18)]">
            <Image
              src="/branding/paunclip-logo.png"
              alt="PaunClip logo"
              width={32}
              height={32}
              className="size-8 object-contain"
              priority
            />
          </div>
        </Link>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="min-w-0"
            >
              <p className="text-sm font-semibold tracking-tight text-foreground">PaunClip</p>
              <p className="text-[0.7rem] text-muted">AI Video Clipping</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Collapse toggle */}
      <div className="px-3 pb-2">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium text-muted transition-colors hover:bg-panel-muted hover:text-foreground-soft"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <>
              <ChevronLeft className="size-4" />
              <span className="text-[0.7rem] uppercase tracking-wider">Collapse</span>
            </>
          )}
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map((item) => (
          <SidebarLink
            key={item.key}
            item={item}
            active={isActive(item.href)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="space-y-1 border-t border-stroke px-3 py-3">
        {SUPPORT_ITEMS.map((item) => (
          <SidebarLink
            key={item.key}
            item={item}
            active={isActive(item.href)}
            collapsed={collapsed}
          />
        ))}
      </div>
    </aside>
  );
}
