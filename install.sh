#!/usr/bin/env bash
set -euo pipefail

skip_install=0
skip_smoke=0
force=0
dry_run=0

usage() {
  cat <<'EOF'
PaunClip Linux installer

Usage:
  ./install.sh [--skip-install] [--skip-smoke] [--force] [--dry-run]

Options:
  --skip-install   Skip npm ci and media tool download.
  --skip-smoke     Skip npm run cli:smoke.
  --force          Replace an existing paunclip wrapper.
  --dry-run        Validate and print actions without changing files or PATH.

This installer requires Node.js 22+ and npm.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --skip-install|-skip-install) skip_install=1 ;;
    --skip-smoke|-skip-smoke) skip_smoke=1 ;;
    --force|-force) force=1 ;;
    --dry-run|-dry-run) dry_run=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1. Run ./install.sh --help" >&2; exit 2 ;;
  esac
  shift
done

step() {
  printf '[PaunClip] %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 was not found. Install Node.js 22+ first, then open a new terminal." >&2
    exit 1
  fi
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
cli_entry="$repo_root/bin/paunclip.cjs"
package_json="$repo_root/package.json"

if [ ! -f "$package_json" ]; then
  echo "package.json was not found. Run this script from the PaunClip repository root." >&2
  exit 1
fi
if [ ! -f "$cli_entry" ]; then
  echo "CLI entrypoint was not found at $cli_entry." >&2
  exit 1
fi

require_command node
require_command npm

node_version="$(node -p "process.versions.node")"
node_major="$(node -p "process.versions.node.split('.')[0]")"
if [ "$node_major" -lt 22 ]; then
  echo "Node.js $node_version is installed, but PaunClip CLI requires Node.js 22+." >&2
  exit 1
fi

step "Repository: $repo_root"
step "Node.js: $node_version"

if [ "$skip_install" -eq 0 ]; then
  if [ "$dry_run" -eq 1 ]; then
    step "Would run: npm ci"
    step "Would run: npm run desktop:tools"
  else
    step "Installing npm dependencies..."
    (cd "$repo_root" && npm ci)
    step "Downloading bundled media tools..."
    (cd "$repo_root" && npm run desktop:tools)
  fi
fi

bin_dir="${PAUNCLIP_BIN_DIR:-$HOME/.local/bin}"
wrapper_path="$bin_dir/paunclip"

if [ -f "$wrapper_path" ] && [ "$force" -eq 0 ]; then
  if ! grep -F "$repo_root" "$wrapper_path" >/dev/null 2>&1; then
    echo "$wrapper_path already exists and points somewhere else. Re-run with --force to replace it." >&2
    exit 1
  fi
fi

if [ "$dry_run" -eq 1 ]; then
  step "Would create wrapper: $wrapper_path"
else
  mkdir -p "$bin_dir"
  cat > "$wrapper_path" <<EOF
#!/usr/bin/env sh
exec node "$repo_root/bin/paunclip.cjs" "\$@"
EOF
  chmod +x "$wrapper_path"
  step "Created wrapper: $wrapper_path"
fi

path_has_bin=0
case ":$PATH:" in
  *":$bin_dir:"*) path_has_bin=1 ;;
esac

add_path_block() {
  file="$1"
  if [ ! -f "$file" ]; then
    if [ "$dry_run" -eq 1 ]; then
      step "Would create shell profile: $file"
    else
      touch "$file"
    fi
  fi

  if [ -f "$file" ] && grep -F "# >>> PaunClip CLI >>>" "$file" >/dev/null 2>&1; then
    step "PATH block already exists in: $file"
    return
  fi

  if [ "$dry_run" -eq 1 ]; then
    step "Would add PATH block to: $file"
  else
    {
      printf '\n# >>> PaunClip CLI >>>\n'
      printf 'export PATH="%s:$PATH"\n' "$bin_dir"
      printf '# <<< PaunClip CLI <<<\n'
    } >> "$file"
    step "Added PATH block to: $file"
  fi
}

if [ "$path_has_bin" -eq 1 ]; then
  step "PATH already contains: $bin_dir"
else
  profile_file="${PROFILE:-$HOME/.profile}"
  add_path_block "$profile_file"
  if [ -n "${ZSH_VERSION:-}" ] || [ -f "$HOME/.zshrc" ]; then
    add_path_block "$HOME/.zshrc"
  fi
fi

if [ "$skip_smoke" -eq 0 ]; then
  if [ "$dry_run" -eq 1 ]; then
    step "Would run: npm run cli:smoke"
  else
    step "Running CLI smoke check..."
    (cd "$repo_root" && npm run cli:smoke)
  fi
fi

step "Install complete."
printf '\nTry:\n'
printf '  paunclip --help\n'
printf '  paunclip doctor\n\n'
printf 'If this shell does not see paunclip yet, run: source ~/.profile\n'
