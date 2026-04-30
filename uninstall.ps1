$ErrorActionPreference = "Stop"

$DryRun = $false
$ShowHelp = $false

foreach ($arg in $args) {
  switch -Regex ($arg.ToLowerInvariant()) {
    "^(--?dry-run|-dryrun)$" { $DryRun = $true; continue }
    "^(--?help|-h|/\\?)$" { $ShowHelp = $true; continue }
    default { throw "Unknown option: $arg. Run .\uninstall.ps1 --help" }
  }
}

if ($ShowHelp) {
  @"
PaunClip Windows uninstaller

Usage:
  .\uninstall.ps1 [--dry-run]

Options:
  --dry-run   Print actions without changing files or PATH.
"@ | Write-Host
  exit 0
}

function Write-Step($message) {
  Write-Host "[PaunClip] $message"
}

function Normalize-PathEntry($value) {
  return $value.Trim().TrimEnd("\")
}

function Test-PathEntryEquals($left, $right) {
  return (Normalize-PathEntry $left).Equals((Normalize-PathEntry $right), [System.StringComparison]::OrdinalIgnoreCase)
}

$LocalAppData = $env:LOCALAPPDATA
if ([string]::IsNullOrWhiteSpace($LocalAppData)) {
  $LocalAppData = Join-Path $HOME "AppData\Local"
}
$BinDir = Join-Path $LocalAppData "PaunClip\bin"
$ShimPath = Join-Path $BinDir "paunclip.cmd"

if (Test-Path $ShimPath) {
  if ($DryRun) {
    Write-Step "Would remove shim: $ShimPath"
  } else {
    Remove-Item -LiteralPath $ShimPath -Force
    Write-Step "Removed shim: $ShimPath"
  }
} else {
  Write-Step "No shim found at: $ShimPath"
}

if ((Test-Path $BinDir) -and -not (Get-ChildItem -LiteralPath $BinDir -Force -ErrorAction SilentlyContinue)) {
  if ($DryRun) {
    Write-Step "Would remove empty bin directory: $BinDir"
  } else {
    Remove-Item -LiteralPath $BinDir -Force
    Write-Step "Removed empty bin directory: $BinDir"
  }
}

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($null -eq $UserPath) {
  $UserPath = ""
}
$entries = $UserPath.Split(";", [System.StringSplitOptions]::RemoveEmptyEntries)
$kept = @()
$removed = $false
foreach ($entry in $entries) {
  if (Test-PathEntryEquals $entry $BinDir) {
    $removed = $true
  } else {
    $kept += $entry
  }
}

if ($removed) {
  if ($DryRun) {
    Write-Step "Would remove from user PATH: $BinDir"
  } else {
    [Environment]::SetEnvironmentVariable("Path", ($kept -join ";"), "User")
    $env:Path = ($env:Path.Split(";", [System.StringSplitOptions]::RemoveEmptyEntries) | Where-Object { -not (Test-PathEntryEquals $_ $BinDir) }) -join ";"
    Write-Step "Removed from user PATH: $BinDir"
  }
} else {
  Write-Step "User PATH does not contain: $BinDir"
}

Write-Step "Uninstall complete."
Write-Host "Open a new terminal to refresh PATH."
