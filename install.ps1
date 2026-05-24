$ErrorActionPreference = "Stop"

$SkipInstall = $false
$SkipSmoke = $false
$Force = $false
$DryRun = $false
$ShowHelp = $false

foreach ($arg in $args) {
  switch -Regex ($arg.ToLowerInvariant()) {
    "^(--?skip-install|-skipinstall)$" { $SkipInstall = $true; continue }
    "^(--?skip-smoke|-skipsmoke)$" { $SkipSmoke = $true; continue }
    "^(--?force|-force)$" { $Force = $true; continue }
    "^(--?dry-run|-dryrun)$" { $DryRun = $true; continue }
    "^(--?help|-h|/\\?)$" { $ShowHelp = $true; continue }
    default { throw "Unknown option: $arg. Run .\install.ps1 --help" }
  }
}

if ($ShowHelp) {
  @"
PaunClip Windows installer

Usage:
  .\install.ps1 [--skip-install] [--skip-smoke] [--force] [--dry-run]

Options:
  --skip-install   Skip npm ci and media tool download.
  --skip-smoke     Skip npm run cli:smoke.
  --force          Replace an existing paunclip.cmd shim.
  --dry-run        Validate and print actions without changing files or PATH.

This installer requires Node.js 22+ and npm.
"@ | Write-Host
  exit 0
}

function Write-Step($message) {
  Write-Host "[PaunClip] $message"
}

function Require-Command($name) {
  $command = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "$name was not found. Install Node.js 22+ first, then open a new terminal."
  }
  return $command
}

function Get-NodeMajorVersion {
  $version = (& node -p "process.versions.node").Trim()
  $major = [int]($version.Split(".")[0])
  return @{ Version = $version; Major = $major }
}

function Normalize-PathEntry($value) {
  return $value.Trim().TrimEnd("\")
}

function Test-PathEntryEquals($left, $right) {
  return (Normalize-PathEntry $left).Equals((Normalize-PathEntry $right), [System.StringComparison]::OrdinalIgnoreCase)
}

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$CliEntry = Join-Path $RepoRoot "bin\paunclip.cjs"
$PackageJson = Join-Path $RepoRoot "package.json"

if (-not (Test-Path $PackageJson)) {
  throw "package.json was not found. Run this script from the PaunClip repository root."
}
if (-not (Test-Path $CliEntry)) {
  throw "CLI entrypoint was not found at $CliEntry."
}

Require-Command "node" | Out-Null
Require-Command "npm" | Out-Null
$node = Get-NodeMajorVersion
if ($node.Major -lt 22) {
  throw "Node.js $($node.Version) is installed, but PaunClip CLI requires Node.js 22+."
}
$NodePlatform = (& node -p "process.platform").Trim()
$NodeArch = (& node -p "process.arch").Trim()
$YtdlpBinary = if ($NodePlatform -eq "win32") { "yt-dlp.exe" } else { "yt-dlp" }
$YtdlpBundle = Join-Path $RepoRoot "vendor\bin\$NodePlatform\$NodeArch\$YtdlpBinary"

Write-Step "Repository: $RepoRoot"
Write-Step "Node.js: $($node.Version)"

if (-not $SkipInstall) {
  if ($DryRun) {
    Write-Step "Would run: npm ci"
    Write-Step "Would run: npm run desktop:tools"
  } else {
    Push-Location $RepoRoot
    try {
      Write-Step "Installing npm dependencies..."
      npm ci
      Write-Step "Downloading bundled media tools..."
      npm run desktop:tools
    } finally {
      Pop-Location
    }
  }
}

$LocalAppData = $env:LOCALAPPDATA
if ([string]::IsNullOrWhiteSpace($LocalAppData)) {
  $LocalAppData = Join-Path $HOME "AppData\Local"
}
$BinDir = Join-Path $LocalAppData "PaunClip\bin"
$ShimPath = Join-Path $BinDir "paunclip.cmd"
$ShimContent = @"
@echo off
set "PAUNCLIP_REPO=$RepoRoot"
set "YTDLP_PATH=$YtdlpBundle"
node "%PAUNCLIP_REPO%\bin\paunclip.cjs" %*
"@

if ((Test-Path $ShimPath) -and -not $Force) {
  $existing = Get-Content -Raw $ShimPath
  if ($existing -notlike "*$RepoRoot*") {
    throw "$ShimPath already exists and points somewhere else. Re-run with --force to replace it."
  }
}

if ($DryRun) {
  Write-Step "Would create shim: $ShimPath"
} else {
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  Set-Content -LiteralPath $ShimPath -Value $ShimContent -Encoding ASCII
  Write-Step "Created shim: $ShimPath"
}

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($null -eq $UserPath) {
  $UserPath = ""
}
$entries = $UserPath.Split(";", [System.StringSplitOptions]::RemoveEmptyEntries)
$alreadyInPath = $false
foreach ($entry in $entries) {
  if (Test-PathEntryEquals $entry $BinDir) {
    $alreadyInPath = $true
    break
  }
}

if ($alreadyInPath) {
  Write-Step "PATH already contains: $BinDir"
} elseif ($DryRun) {
  Write-Step "Would add to user PATH: $BinDir"
} else {
  $newUserPath = if ([string]::IsNullOrWhiteSpace($UserPath)) { $BinDir } else { "$UserPath;$BinDir" }
  [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
  if (-not ($env:Path.Split(";", [System.StringSplitOptions]::RemoveEmptyEntries) | Where-Object { Test-PathEntryEquals $_ $BinDir })) {
    $env:Path = "$env:Path;$BinDir"
  }
  Write-Step "Added to user PATH: $BinDir"
}

if (-not $SkipSmoke) {
  if ($DryRun) {
    Write-Step "Would run: npm run cli:smoke"
  } else {
    Push-Location $RepoRoot
    try {
      Write-Step "Running CLI smoke check..."
      npm run cli:smoke
    } finally {
      Pop-Location
    }
  }
}

Write-Step "Install complete."
Write-Host ""
Write-Host "Try:"
Write-Host "  paunclip --help"
Write-Host "  paunclip doctor"
Write-Host ""
Write-Host "If this terminal does not see paunclip yet, open a new PowerShell window."
