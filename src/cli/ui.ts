const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  cyan: "\u001b[36m",
  gray: "\u001b[90m",
  orange: "\u001b[38;5;214m"
} as const;

type ColorName = keyof Omit<typeof ANSI, "reset">;

export function shouldUseColor(input: { json: boolean; noColor: boolean }) {
  if (input.json || input.noColor || process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") return true;
  if (process.env.CI) return false;
  return Boolean(process.stdout.isTTY);
}

export function paint(enabled: boolean, color: ColorName, value: string) {
  return enabled ? `${ANSI[color]}${value}${ANSI.reset}` : value;
}

export function bold(enabled: boolean, value: string) {
  return paint(enabled, "bold", value);
}

export function dim(enabled: boolean, value: string) {
  return paint(enabled, "dim", value);
}

export function brand(enabled: boolean, value: string) {
  return enabled ? `${ANSI.orange}${ANSI.bold}${value}${ANSI.reset}` : value;
}

export function success(enabled: boolean, value: string) {
  return paint(enabled, "green", value);
}

export function warning(enabled: boolean, value: string) {
  return paint(enabled, "yellow", value);
}

export function danger(enabled: boolean, value: string) {
  return paint(enabled, "red", value);
}

export function info(enabled: boolean, value: string) {
  return paint(enabled, "cyan", value);
}

export function command(enabled: boolean, value: string) {
  return paint(enabled, "blue", value);
}

export function pathText(enabled: boolean, value: string) {
  return paint(enabled, "magenta", value);
}

export function cliBanner(enabled: boolean) {
  return brand(
    enabled,
    [
      " ____                  ____ _ _       ",
      "|  _ \\ __ _ _   _ _ __ / ___| (_)_ __ ",
      "| |_) / _` | | | | '_ \\ |   | | | '_ \\",
      "|  __/ (_| | |_| | | | | |___| | | |_) |",
      "|_|   \\__,_|\\__,_|_| |_|\\____|_|_| .__/",
      "                                  |_|   "
    ].join("\n")
  );
}

export function section(enabled: boolean, title: string) {
  return `${brand(enabled, title)}\n${dim(enabled, "-".repeat(Math.max(12, visibleLength(title))))}`;
}

export function badge(enabled: boolean, status: string) {
  const normalized = status.toLowerCase();
  const label = status.toUpperCase();
  if (["ok", "ready", "completed", "success"].includes(normalized)) return success(enabled, label);
  if (["warn", "warning", "queued", "running", "processing"].includes(normalized)) return warning(enabled, label);
  if (["block", "blocker", "blocked", "failed", "error", "missing", "cancelled"].includes(normalized)) {
    return danger(enabled, label);
  }
  return info(enabled, label);
}

export function keyValue(enabled: boolean, key: string, value: string) {
  return `${dim(enabled, key.padEnd(12))} ${value}`;
}

export function nextSteps(enabled: boolean, steps: string[]) {
  if (steps.length === 0) return "";
  return [section(enabled, "Next"), ...steps.map((step) => `  ${command(enabled, step)}`)].join("\n");
}

export function table(rows: string[][], options: { headers?: string[]; color: boolean }) {
  if (rows.length === 0) return dim(options.color, "No rows.");

  const allRows = options.headers ? [options.headers, ...rows] : rows;
  const widths = allRows.reduce<number[]>((current, row) => {
    row.forEach((cell, index) => {
      current[index] = Math.max(current[index] ?? 0, visibleLength(cell));
    });
    return current;
  }, []);

  const formatRow = (row: string[]) =>
    row
      .map((cell, index) => `${cell}${" ".repeat(Math.max(0, (widths[index] ?? 0) - visibleLength(cell)))}`)
      .join("  ");

  const lines: string[] = [];
  if (options.headers) {
    lines.push(formatRow(options.headers.map((header) => bold(options.color, header))));
    lines.push(widths.map((width) => dim(options.color, "-".repeat(width))).join("  "));
  }
  lines.push(...rows.map(formatRow));
  return lines.join("\n");
}

export function shortId(value: string, length = 10) {
  return value.length <= length ? value : `${value.slice(0, length)}...`;
}

export function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function visibleLength(value: string) {
  return stripAnsi(value).length;
}
