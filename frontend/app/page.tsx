"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Upload,
  Link as LinkIcon,
  ClipboardPaste,
  PlaySquare,
  FolderKanban,
  LibraryBig,
  ArrowRight,
  Film,
  LoaderCircle,
  WifiOff,
  Activity,
} from "lucide-react";

import { useProgress } from "@/hooks/use-progress";
import { campaignsApi, sessionsApi } from "@/lib/api";
import { cx, formatRelativeDate, titleCaseLabel } from "@/lib/utils";
import type { SessionSummary } from "@/types/api";

/* ------------------------------------------------------------------ */
/*  Stats Card                                                         */
/* ------------------------------------------------------------------ */
function StatCard({
  icon: Icon,
  label,
  value,
  href,
  tone = "accent",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  href: string;
  tone?: "accent" | "brand" | "success";
}) {
  const toneMap = {
    accent: "text-accent bg-accent/10 border-accent/20",
    brand: "text-brand bg-brand/10 border-brand/20",
    success: "text-success bg-success/10 border-success/20",
  };

  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl border border-stroke bg-panel p-5 transition-colors hover:border-stroke-strong"
    >
      <div className="flex items-start justify-between">
        <div className={cx("flex size-10 items-center justify-center rounded-xl border", toneMap[tone])}>
          <Icon className="size-5" />
        </div>
        <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground-soft" />
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Session Thumbnail Card                                             */
/* ------------------------------------------------------------------ */
function SessionCard({ session }: { session: SessionSummary }) {
  return (
    <Link
      href={`/sessions/${session.session_id}`}
      className="group relative overflow-hidden rounded-2xl border border-stroke bg-panel transition-colors hover:border-stroke-strong"
    >
      <div className="relative aspect-video bg-panel-muted">
        <div className="absolute inset-0 flex items-center justify-center">
          <Film className="size-8 text-muted/40" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-panel/90 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-3 right-3">
          <p className="truncate text-sm font-medium text-foreground">
            {session.title || "Untitled Session"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {session.channel || "Unknown channel"} · {formatRelativeDate(session.updated_at)}
          </p>
        </div>
        <div className="absolute right-3 top-3">
          <span
            className={cx(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider",
              session.status === "completed"
                ? "bg-success/15 text-success"
                : session.status === "failed"
                  ? "bg-danger/15 text-danger"
                  : "bg-warning/15 text-warning",
            )}
          >
            {titleCaseLabel(session.status)}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          <PlaySquare className="size-3.5" />
          <span>{session.highlight_count} highlights</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{session.clip_job_count} clips</span>
        </div>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard Page                                                     */
/* ------------------------------------------------------------------ */
export default function Home() {
  const router = useRouter();
  const { connection, data: progressData } = useProgress();
  const isOnline = connection === "online";

  const [url, setUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [campaignCount, setCampaignCount] = useState(0);
  const [clipCount, setClipCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Fetch dashboard data */
  useEffect(() => {
    async function load() {
      const [sessionsRes, campaignsRes] = await Promise.all([
        sessionsApi.safeList(),
        campaignsApi.safeList(),
      ]);

      const sessionsData = sessionsRes.data ?? [];
      setSessions(sessionsData.slice(0, 4));
      setSessionCount(sessionsData.length);
      setCampaignCount(campaignsRes.data?.length ?? 0);

      const totalClips = sessionsData.reduce(
        (sum, s) => sum + (s.clip_job_count || 0),
        0,
      );
      setClipCount(totalClips);
      setLoading(false);
    }

    void load();
  }, []);

  /* Drag & drop handlers */
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("video/"),
      );
      if (files.length > 0) {
        router.push("/manual");
      }
    },
    [router],
  );

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        router.push("/manual");
      }
    },
    [router],
  );

  const onPasteUrl = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch {
      // ignore
    }
  }, []);

  const onStartFromUrl = useCallback(() => {
    if (url.trim()) {
      router.push(`/manual?url=${encodeURIComponent(url.trim())}`);
    }
  }, [url, router]);

  /* Backend status dot */
  const statusColor = !isOnline
    ? "bg-danger"
    : progressData.is_running
      ? "bg-warning"
      : "bg-success";

  return (
    <div className="space-y-8">
      {/* Subtle backend status - top right */}
      <div className="flex justify-end">
        <div className="flex items-center gap-2 rounded-full border border-stroke bg-panel/60 px-3 py-1.5 backdrop-blur-sm">
          {!isOnline ? (
            <WifiOff className="size-3.5 text-danger" />
          ) : progressData.is_running ? (
            <LoaderCircle className="size-3.5 animate-spin text-warning" />
          ) : (
            <Activity className="size-3.5 text-success" />
          )}
          <span className="text-xs font-medium text-muted">
            {!isOnline
              ? "Backend offline"
              : progressData.is_running
                ? titleCaseLabel(progressData.task_type ?? "processing")
                : "Backend online"}
          </span>
          <span className={cx("size-2 rounded-full", statusColor)} />
        </div>
      </div>

      {/* Hero Upload Section */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-[2rem] border border-stroke bg-panel shadow-[var(--shadow-panel)]"
      >
        {/* ambient glow */}
        <div className="pointer-events-none absolute -left-20 -top-20 size-72 rounded-full bg-accent/8 blur-[80px]" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 size-72 rounded-full bg-brand/8 blur-[80px]" />

        <div className="relative px-6 py-10 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl"
            >
              Upload Video to Get Started
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted sm:text-base"
            >
              Drop a video file or paste a URL. PaunClip will find highlights, generate hooks,
              add captions, and reframe to portrait — automatically.
            </motion.p>
          </div>

          {/* Drag & Drop Zone */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-8 max-w-xl"
          >
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cx(
                "relative cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-200",
                isDragging
                  ? "border-accent bg-accent/5"
                  : "border-stroke bg-panel-muted hover:border-stroke-strong hover:bg-panel",
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={onFileSelect}
              />
              <div
                className={cx(
                  "mx-auto flex size-14 items-center justify-center rounded-2xl border transition-colors",
                  isDragging
                    ? "border-accent/30 bg-accent/10 text-accent"
                    : "border-stroke bg-panel text-muted",
                )}
              >
                <Upload className="size-6" />
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">
                {isDragging ? "Drop video here" : "Drag & drop video files"}
              </p>
              <p className="mt-1 text-xs text-muted">or click to browse</p>
            </div>
          </motion.div>

          {/* URL Input */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-5 max-w-xl"
          >
            <div className="flex items-center gap-2 rounded-xl border border-stroke bg-panel-muted px-4 py-2.5 transition-colors focus-within:border-stroke-strong">
              <LinkIcon className="size-4 shrink-0 text-muted" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onStartFromUrl()}
                placeholder="Paste YouTube or video URL"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
              />
              <button
                onClick={onPasteUrl}
                className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-panel hover:text-foreground-soft"
                title="Paste from clipboard"
              >
                <ClipboardPaste className="size-3.5" />
                Paste
              </button>
              <button
                onClick={onStartFromUrl}
                disabled={!url.trim()}
                className={cx(
                  "shrink-0 rounded-lg px-4 py-1.5 text-xs font-semibold text-background transition-colors",
                  url.trim()
                    ? "bg-accent hover:bg-accent/90"
                    : "bg-muted cursor-not-allowed",
                )}
              >
                Start
              </button>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Quick Stats */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <StatCard
          icon={PlaySquare}
          label="Active Sessions"
          value={loading ? "—" : sessionCount}
          href="/sessions"
          tone="accent"
        />
        <StatCard
          icon={LibraryBig}
          label="Recent Clips"
          value={loading ? "—" : clipCount}
          href="/library"
          tone="brand"
        />
        <StatCard
          icon={FolderKanban}
          label="Campaigns"
          value={loading ? "—" : campaignCount}
          href="/campaigns"
          tone="success"
        />
      </motion.section>

      {/* Recent Sessions */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Recent Sessions
          </h2>
          <Link
            href="/sessions"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-foreground"
          >
            View all
            <ArrowRight className="size-4" />
          </Link>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center rounded-2xl border border-stroke bg-panel">
            <LoaderCircle className="size-6 animate-spin text-accent" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-stroke bg-panel text-center">
            <Film className="size-8 text-muted/40" />
            <p className="mt-3 text-sm text-muted">No sessions yet</p>
            <p className="text-xs text-muted">Create your first clip to get started</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sessions.map((session, i) => (
              <motion.div
                key={session.session_id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.5 + i * 0.06,
                  duration: 0.4,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <SessionCard session={session} />
              </motion.div>
            ))}
          </div>
        )}
      </motion.section>
    </div>
  );
}
