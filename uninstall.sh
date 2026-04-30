#!/usr/bin/env bash
set -euo pipefail

dry_run=0

usage() {
  cat <<'EOF'
PaunClip Linux uninstaller

Usage:
  ./uninstall.sh [--dry-run]

Options:
  --dry-run   Print actions without changing files or PATH.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run|-dry-run) dry_run=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1. Run ./uninstall.sh --help" >&2; exit 2 ;;
  esac
  shift
done

step() {
  printf '[PaunClip] %s\n' "$1"
}

bin_dir="${PAUNCLIP_BIN_DIR:-$HOME/.local/bin}"
wrapper_path="$bin_dir/paunclip"

if [ -f "$wrapper_path" ]; then
  if [ "$dry_run" -eq 1 ]; then
    step "Would remove wrapper: $wrapper_path"
  else
    rm -f "$wrapper_path"
    step "Removed wrapper: $wrapper_path"
  fi
else
  step "No wrapper found at: $wrapper_path"
fi

remove_path_block() {
  file="$1"
  if [ ! -f "$file" ]; then
    return
  fi
  if ! grep -F "# >>> PaunClip CLI >>>" "$file" >/dev/null 2>&1; then
    return
  fi
  if [ "$dry_run" -eq 1 ]; then
    step "Would remove PATH block from: $file"
    return
  fi
  tmp_file="$(mktemp)"
  awk '
    /# >>> PaunClip CLI >>>/ { skip = 1; next }
    /# <<< PaunClip CLI <<</ { skip = 0; next }
    skip != 1 { print }
  ' "$file" > "$tmp_file"
  mv "$tmp_file" "$file"
  step "Removed PATH block from: $file"
}

remove_path_block "$HOME/.profile"
remove_path_block "$HOME/.zshrc"

step "Uninstall complete."
printf 'Open a new shell to refresh PATH.\n'
