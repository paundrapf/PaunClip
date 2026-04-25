"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  AudioWaveform,
  Captions,
  CheckCircle2,
  Crop,
  Flame,
  ImagePlus,
  Link as LinkIcon,
  Loader2,
  Scissors,
  Sparkles,
  Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/features/trpc/client";
import { sessionConfigSchema } from "@/shared/schemas/session";

const tools = [
  { label: "Long to shorts", icon: Sparkles, color: "text-lime-300", href: "/workflow" },
  { label: "AI Captions", icon: Captions, color: "text-emerald-300", href: "/workflow" },
  { label: "Video editor", icon: Scissors, color: "text-sky-300", href: "/projects" },
  { label: "Enhance speech", icon: AudioWaveform, color: "text-cyan-300", href: "/settings" },
  { label: "AI Reframe", icon: Crop, color: "text-blue-300", href: "/workflow" },
  { label: "AI B-Roll", icon: ImagePlus, color: "text-indigo-300", href: "/campaigns" },
  { label: "AI hook", icon: Flame, color: "text-amber-300", href: "/workflow" }
];

const defaultConfig = sessionConfigSchema.parse({});

export function DashboardScreen({ mode = "home" }: { mode?: "home" | "projects" }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"all" | "saved">("all");
  const sessions = trpc.session.list.useQuery(undefined, { refetchInterval: 3000 });
  const createSession = trpc.session.create.useMutation({
    onSuccess: ({ session }) => router.push(`/results/${session.id}`)
  });

  const isWorking = createSession.isPending;

  async function submitUrl() {
    setError("");
    if (!url.trim()) {
      setError("Paste YouTube URL dulu, atau upload file video.");
      return;
    }

    await createSession.mutateAsync({
      sourceType: "youtube",
      sourceUrl: url.trim(),
      config: defaultConfig
    });
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
    await createSession.mutateAsync({
      sourceType: "upload",
      uploadId: uploaded.uploadId,
      config: defaultConfig
    });
  }

  const visibleSessions = sessions.data ?? [];

  return (
    <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col px-8 py-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500">Local workspace</p>
          <h1 className="mt-1 text-2xl font-bold text-white">
            {mode === "projects" ? "Projects" : "PaunClip"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Badge>{visibleSessions.length} sessions</Badge>
          <Button variant="secondary" size="sm" onClick={() => router.push("/settings")}>
            Settings
          </Button>
        </div>
      </header>

      <section className="grid flex-1 place-items-center py-10">
        <div className="w-full max-w-3xl rounded-lg border border-zinc-800 bg-black/60 p-9 shadow-2xl shadow-black/30">
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void submitUrl();
            }}
          >
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Source video
              </span>
              <div className="relative">
                <LinkIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  className="pl-12"
                  placeholder="Paste a YouTube link"
                  disabled={isWorking}
                />
              </div>
            </label>
            {error ? <p className="text-sm font-medium text-red-300">{error}</p> : null}
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
                uploadAndStart(file).catch((uploadError) =>
                  setError(uploadError instanceof Error ? uploadError.message : "Upload failed")
                );
                event.currentTarget.value = "";
              }}
            />
            <div className="flex flex-wrap items-center gap-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isWorking}
              >
                {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload
              </Button>
              <Button type="submit" variant="primary" className="min-w-56" disabled={isWorking}>
                {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Get clips in 1 click
              </Button>
              <Button type="button" variant="ghost" onClick={() => router.push("/workflow")}>
                Advanced config
              </Button>
            </div>
          </form>
        </div>
      </section>

      <section className="grid gap-9 pb-10">
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4 xl:grid-cols-7">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.label}
                href={tool.href as Route}
                className="grid justify-items-center gap-3 rounded-lg border border-transparent p-3 text-sm font-semibold text-white transition hover:border-zinc-800 hover:bg-zinc-950"
              >
                <span className="grid h-16 w-16 place-items-center rounded-full bg-zinc-900">
                  <Icon className={`h-7 w-7 ${tool.color}`} aria-hidden="true" />
                </span>
                {tool.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-900 pt-6">
          <div className="flex gap-6 text-sm font-semibold">
            <button
              className={tab === "all" ? "text-white" : "text-zinc-500"}
              onClick={() => setTab("all")}
            >
              All projects ({visibleSessions.length})
            </button>
            <button
              className={tab === "saved" ? "text-white" : "text-zinc-500"}
              onClick={() => setTab("saved")}
            >
              Saved projects (0)
            </button>
          </div>
          <div className="flex gap-3">
            <Badge>Auto-save</Badge>
            <Badge>Auto-import off</Badge>
          </div>
        </div>

        {tab === "saved" ? (
          <div className="rounded-lg border border-dashed border-zinc-800 py-12 text-center text-sm text-zinc-500">
            Saved projects will appear here after clip feedback is implemented.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleSessions.map((session) => {
              const latestJob = session.jobs[0];
              return (
                <Link
                  key={session.id}
                  href={`/results/${session.id}`}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 transition hover:border-zinc-600"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="line-clamp-2 font-semibold">
                        {session.sourceTitle || session.sourceUrl || session.id}
                      </h3>
                      <p className="mt-2 text-sm text-zinc-500">
                        {session.sourceType} · {session.stage}
                      </p>
                    </div>
                    <Badge>{latestJob?.progress ?? 0}%</Badge>
                  </div>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-900">
                    <div
                      className="h-full rounded-full bg-lime-300"
                      style={{ width: `${latestJob?.progress ?? (session.status === "completed" ? 100 : 0)}%` }}
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
