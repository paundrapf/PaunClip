"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

type PreflightIssue = {
  severity: "blocker" | "warning";
  area: string;
  action: string;
  message: string;
  detail?: string;
};

type PreflightReport = {
  ok: boolean;
  blockers: PreflightIssue[];
  warnings: PreflightIssue[];
};

export function PreflightPanel({
  report,
  title = "Ready to clip"
}: {
  report?: PreflightReport;
  title?: string;
}) {
  if (!report) {
    return null;
  }

  const issues = [...report.blockers, ...report.warnings];
  if (issues.length === 0) {
    return (
      <div className="rounded-lg border border-lime-400/30 bg-lime-400/10 px-4 py-3 text-sm text-[var(--text)]">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4 text-lime-300" aria-hidden="true" />
          {title}
        </div>
        <p className="mt-1 text-[var(--muted)]">All required tools and providers look ready.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm text-[var(--text)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden="true" />
          {report.ok ? "Ready with warnings" : "Setup required before clipping"}
        </div>
        <Link
          href="/settings"
          className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--panel-raised)] px-3 text-xs font-semibold text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--panel-soft)]"
        >
          Open settings
        </Link>
      </div>
      <ul className="mt-3 space-y-2 text-[var(--muted)]">
        {issues.slice(0, 5).map((issue, index) => (
          <li key={`${issue.area}-${index}`} className="break-words">
            <span className={issue.severity === "blocker" ? "text-red-200" : "text-amber-100"}>
              {issue.severity === "blocker" ? "Blocker" : "Warning"}:
            </span>{" "}
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
