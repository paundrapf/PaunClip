import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FolderKanban, LibraryBig, WandSparkles } from "lucide-react";

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-stroke bg-panel shadow-[0_18px_60px_rgba(0,0,0,0.38)]">
        <div className="relative aspect-[16/5] w-full bg-panel-muted">
          <Image
            src="/branding/paunclip-banner.png"
            alt="PaunClip banner"
            fill
            priority
            className="object-cover"
          />
        </div>
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:px-8 lg:py-8">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">PaunClip</p>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                Personal content operations workstation for turning long videos into short clips.
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted sm:text-base">
                Run campaigns, inspect queue state, resume deterministic sessions, edit highlights, and render outputs from the same persisted contracts that already power the engine.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Link
              href="/campaigns"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-pill border border-stroke-strong bg-accent/10 px-5 text-sm font-semibold text-foreground transition hover:bg-accent/14"
            >
              Open Campaigns
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/manual"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-pill border border-stroke bg-panel-muted px-5 text-sm font-semibold text-foreground-soft transition hover:border-stroke-strong hover:text-foreground"
            >
              New Manual Session
            </Link>
            <Link
              href="/sessions"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-pill border border-stroke bg-panel-muted px-5 text-sm font-semibold text-foreground-soft transition hover:border-stroke-strong hover:text-foreground"
            >
              Resume Sessions
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-card border border-stroke bg-panel-muted p-5">
          <div className="mb-4 flex size-11 items-center justify-center rounded-card border border-stroke-strong bg-accent/10 text-accent">
            <FolderKanban className="size-5" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Campaign-first workflow</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Fetch channel videos, queue only what matters, and keep deterministic session state attached to each campaign row.
          </p>
        </div>

        <div className="rounded-card border border-stroke bg-panel-muted p-5">
          <div className="mb-4 flex size-11 items-center justify-center rounded-card border border-stroke-strong bg-accent/10 text-accent">
            <WandSparkles className="size-5" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Session workspace</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Review AI highlights, tune hook and caption settings, and render only the clips you actually want to keep.
          </p>
        </div>

        <div className="rounded-card border border-stroke bg-panel-muted p-5">
          <div className="mb-4 flex size-11 items-center justify-center rounded-card border border-stroke-strong bg-accent/10 text-accent">
            <LibraryBig className="size-5" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Outputs and recovery</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Browse outputs, reopen parent sessions, retry failed work, and keep production moving without losing persisted state.
          </p>
        </div>
      </section>
    </div>
  );
}
