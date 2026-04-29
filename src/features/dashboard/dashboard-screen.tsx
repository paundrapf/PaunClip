"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  Captions,
  CheckCircle2,
  Database,
  Flame,
  Link as LinkIcon,
  Loader2,
  PlayCircle,
  Settings,
  Scissors,
  Sparkles,
  Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PreflightPanel } from "@/features/system/preflight-panel";
import { trpc } from "@/features/trpc/client";
import { APP_NAME } from "@/shared/constants/app";
import { BRAND_ASSETS } from "@/shared/constants/brand";
import { sessionConfigSchema } from "@/shared/schemas/session";

const tools = [
  {
    label: "Guided workflow",
    description: "Set source, captions, hooks, and render mode.",
    icon: Sparkles,
    href: "/workflow"
  },
  {
    label: "Review projects",
    description: "Open previous sessions and pick up unfinished work.",
    icon: Scissors,
    href: "/projects"
  },
  {
    label: "Campaign batch",
    description: "Clip selected videos from a channel or list.",
    icon: Flame,
    href: "/campaigns"
  },
  {
    label: "Caption styles",
    description: "Tune presets before rendering a new batch.",
    icon: Captions,
    href: "/settings"
  },
  {
    label: "AI providers",
    description: "Check models, keys, voices, and task routing.",
    icon: Settings,
    href: "/settings"
  },
  {
    label: "Storage",
    description: "Clean temp files and manage output folders.",
    icon: Database,
    href: "/settings"
  }
];

const defaultConfig = sessionConfigSchema.parse({});

export function DashboardScreen({ mode = "home" }: { mode?: "home" | "projects" }) {
  const router = useRouter();
  const { notify } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [config, setConfig] = useState(defaultConfig);
  const sessions = trpc.session.list.useQuery(undefined, { refetchInterval: 3000 });
  const preflight = trpc.settings.preflight.useQuery({
    sourceType: "youtube",
    operation: "create",
    config
  });
  const createSession = trpc.session.create.useMutation({
    onSuccess: ({ session }) => {
      notify({
        type: "success",
        title: "Project started",
        description: "Opening the processing workspace."
      });
      router.push(`/results/${session.id}`);
    },
    onError: (createError) => {
      setError(createError.message);
      notify({
        type: "error",
        title: "Could not start project",
        description: createError.message
      });
    }
  });

  const isWorking = createSession.isPending;
  const startBlocked = Boolean(preflight.data?.blockers.length);

  async function submitUrl() {
    setError("");
    if (!url.trim()) {
      setError("Paste YouTube URL dulu, atau upload file video.");
      notify({
        type: "warning",
        title: "Source is empty",
        description: "Paste a YouTube URL or upload a video first."
      });
      return;
    }
    if (startBlocked) {
      const message = preflight.data?.blockers[0]?.message ?? "Complete setup before clipping.";
      setError(message);
      notify({
        type: "warning",
        title: "Setup required",
        description: message
      });
      return;
    }

    await createSession
      .mutateAsync({
        sourceType: "youtube",
        sourceUrl: url.trim(),
        config
      })
      .catch(() => undefined);
  }

  async function uploadAndStart(file: File) {
    setError("");
    const response = await fetch("/api/upload", {
      method: "POST",
      headers: { "x-file-name": file.name },
      body: file
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Upload failed");
    }

    const uploaded = (await response.json()) as { uploadId: string };
    notify({
      type: "success",
      title: "Upload received",
      description: "Starting clip analysis now."
    });

    await createSession
      .mutateAsync({
        sourceType: "upload",
        uploadId: uploaded.uploadId,
        config
      })
      .catch(() => undefined);
  }

  const visibleSessions = sessions.data ?? [];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col overflow-hidden px-5 py-6 sm:px-8">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {mode === "home" ? (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-[var(--border-strong)] bg-[var(--panel-raised)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.05)]">
              <Image
                src={BRAND_ASSETS.logoTransparent}
                alt={APP_NAME}
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
                priority
              />
            </span>
          ) : null}
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--muted-soft)]">Local workspace</p>
            <h1 className="mt-1 break-words text-2xl font-semibold text-[var(--text)] sm:text-3xl">
              {mode === "projects" ? "Projects" : APP_NAME}
            </h1>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Badge>{visibleSessions.length} projects</Badge>
          <Button variant="secondary" size="sm" onClick={() => router.push("/settings")}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            Settings
          </Button>
        </div>
      </header>

      <section className="grid flex-1 gap-5 py-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.78)] p-5 shadow-[var(--shadow-soft)] sm:p-7">
          {mode === "home" ? (
            <div className="mb-5 flex min-w-0 items-center gap-4 overflow-hidden rounded-lg border border-[var(--border)] bg-[rgb(8_8_7_/_0.72)] px-4 py-3">
              <div className="relative h-12 w-44 shrink-0 sm:w-56">
                <Image
                  src={BRAND_ASSETS.bannerDark}
                  alt={`${APP_NAME} banner`}
                  fill
                  sizes="(max-width: 640px) 176px, 224px"
                  className="object-cover"
                  style={{ objectPosition: "left 62%" }}
                  priority
                />
              </div>
              <p className="hidden min-w-0 text-sm text-[var(--muted)] md:block">
                One place to import, analyze, review, and render short clips.
              </p>
            </div>
          ) : null}
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void submitUrl();
            }}
          >
            <label className="grid gap-2">
              <span className="text-xs font-semibold text-[var(--muted-soft)]">Source video</span>
              <div className="relative">
                <LinkIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted-soft)]" />
                <Input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  className="pl-12 text-base"
                  placeholder="Paste a YouTube link"
                  disabled={isWorking}
                />
              </div>
            </label>
            {error ? <p className="break-words text-sm font-medium text-[#ff9a9a]">{error}</p> : null}
            <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.52)] p-3">
              <span className="text-sm font-semibold text-[var(--text)]">Clips to make</span>
              <div className="flex items-center rounded-full border border-[var(--border)] bg-[rgb(9_9_8_/_0.72)] p-1">
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-full bg-[var(--panel-raised)] text-lg text-[var(--text)] disabled:opacity-40"
                  disabled={config.targetClipCount <= 1 || isWorking}
                  onClick={() =>
                    setConfig((current) =>
                      sessionConfigSchema.parse({
                        ...current,
                        targetClipCount: Math.max(1, current.targetClipCount - 1)
                      })
                    )
                  }
                  aria-label="Reduce clips to make"
                >
                  -
                </button>
                <span className="min-w-14 px-3 text-center text-sm font-semibold text-[var(--text)]">
                  {config.targetClipCount}
                </span>
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-full bg-[var(--panel-raised)] text-lg text-[var(--text)] disabled:opacity-40"
                  disabled={config.targetClipCount >= 10 || isWorking}
                  onClick={() =>
                    setConfig((current) =>
                      sessionConfigSchema.parse({
                        ...current,
                        targetClipCount: Math.min(10, current.targetClipCount + 1)
                      })
                    )
                  }
                  aria-label="Increase clips to make"
                >
                  +
                </button>
              </div>
              <span className="text-xs text-[var(--muted)]">PaunClip will try to find exactly this many moments.</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/x-msvideo"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                uploadAndStart(file).catch((uploadError) => {
                  const message =
                    uploadError instanceof Error ? uploadError.message : "Upload failed";
                  setError(message);
                  notify({
                    type: "error",
                    title: "Upload failed",
                    description: message
                  });
                });
                event.currentTarget.value = "";
              }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isWorking}
              >
                {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload
              </Button>
              <Button type="submit" variant="primary" className="min-w-52" disabled={isWorking || startBlocked}>
                {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Start clipping
              </Button>
              <Button type="button" variant="ghost" onClick={() => router.push("/workflow")}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Advanced config
              </Button>
            </div>
            <PreflightPanel report={preflight.data} />
          </form>
        </div>
        <aside className="grid min-w-0 content-start gap-3 rounded-lg border border-[var(--border)] bg-[rgb(12_12_10_/_0.78)] p-5 shadow-[var(--shadow-tight)]">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold text-[var(--text)]">Workspace pulse</h2>
              <p className="mt-1 text-sm text-[var(--muted-soft)]">Status snapshot</p>
            </div>
            <Badge>local</Badge>
          </div>
          <Metric label="Completed clips" value={String(sumClips(visibleSessions))} />
          <Metric label="Running jobs" value={String(countRunningJobs(visibleSessions))} />
          <Metric label="Needs review" value={String(countFailedSessions(visibleSessions))} />
          <Button variant="secondary" onClick={() => router.push("/settings")}>
            <Database className="h-4 w-4" aria-hidden="true" />
            Storage settings
          </Button>
        </aside>
      </section>

      <section className="grid gap-8 pb-10">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.label}
                href={tool.href as Route}
                className="group grid min-w-0 grid-cols-[44px_minmax(0,1fr)] gap-3 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.62)] p-4 transition-[background,border-color,box-shadow,transform] duration-200 hover:border-[rgb(242_162_58_/_0.42)] hover:bg-[rgb(26_24_20_/_0.88)] hover:shadow-[var(--shadow-tight)]"
              >
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent-strong)]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-[var(--text)]">{tool.label}</span>
                  <span className="mt-1 block text-sm leading-5 text-[var(--muted)]">
                    {tool.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--text)]">Projects</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {visibleSessions.length} sessions in this workspace
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Badge>Auto-save</Badge>
            <Badge>Local files</Badge>
          </div>
        </div>

        {visibleSessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[rgb(18_18_16_/_0.45)] py-12 text-center text-sm text-[var(--muted)]">
            New projects will appear here after you paste a YouTube link or upload a video.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleSessions.map((session) => {
              const latestJob = session.jobs[0];
              const progress = latestJob?.progress ?? (session.status === "completed" ? 100 : 0);
              return (
                <Link
                  key={session.id}
                  href={`/results/${session.id}`}
                  className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.68)] p-5 transition-[background,border-color,box-shadow] hover:border-[var(--border-strong)] hover:bg-[var(--panel-raised)] hover:shadow-[var(--shadow-tight)]"
                >
                  <div className="flex min-w-0 items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 break-words font-semibold text-[var(--text)]">
                        {session.sourceTitle || session.sourceUrl || session.id}
                      </h3>
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        {session.sourceType} / {session.stage}
                      </p>
                    </div>
                    <Badge>{progress}%</Badge>
                  </div>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-[rgb(255_255_255_/_0.06)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.6)] p-4 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.03)]">
      <p className="text-xs font-semibold text-[var(--muted-soft)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{value}</p>
    </div>
  );
}

function sumClips(sessions: Array<{ clips: unknown[] }>) {
  return sessions.reduce((total, session) => total + session.clips.length, 0);
}

function countRunningJobs(sessions: Array<{ jobs: Array<{ status: string }> }>) {
  return sessions.filter((session) =>
    ["queued", "running"].includes(session.jobs[0]?.status ?? "")
  ).length;
}

function countFailedSessions(sessions: Array<{ status: string }>) {
  return sessions.filter((session) =>
    ["failed", "partially_failed"].includes(session.status)
  ).length;
}
