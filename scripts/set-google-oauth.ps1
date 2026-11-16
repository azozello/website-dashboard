<#
.SYNOPSIS
  Puts the Google OAuth client from a downloaded creds.json where Rate 1 needs it. Never prints a secret value.

.DESCRIPTION
  -Local   Writes GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET into api/.env (gitignored) for local development.
  -GitHub  Sets the GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET repository secrets. The deploy workflow
           (.github/workflows/deploy.yml -> infra/deploy/merge-secrets.sh) delivers them to the server.
           Uses the GitHub CLI when it is installed and signed in; otherwise copies each value to the
           clipboard, one at a time, for pasting into GitHub's "New repository secret" form, then clears it.
  Neither switch: does both.

  Also checks that the redirect URIs Rate 1 uses are registered on the OAuth client. Redirect URIs are not
  secret, so missing ones are printed.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\set-google-oauth.ps1 -Local
  powershell -ExecutionPolicy Bypass -File scripts\set-google-oauth.ps1 -GitHub
#>
param(
  [string]$CredsPath,
  [switch]$Local,
  [switch]$GitHub,
  [string]$Repo = 'azozello/website-dashboard',
  [string]$AppUrl = 'https://app.bazed.live',
  [string]$DevUrl = 'http://localhost:5173'
)

$ErrorActionPreference = 'Stop'
if (-not $Local -and -not $GitHub) { $Local = $true; $GitHub = $true }

function Fail([string]$message) { Write-Host "ERROR: $message" -ForegroundColor Red; exit 1 }

# Runs a native command silently and returns its exit code. Windows PowerShell 5.1 turns redirected stderr
# into terminating errors under 'Stop', so the preference is relaxed for the call.
function Quiet([scriptblock]$Command) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Command *> $null } finally { $ErrorActionPreference = $prev }
  return $LASTEXITCODE
}

# Repository root of this checkout, and the main checkout (creds.json usually sits there, not in a worktree).
$repoRoot = (& git -C $PSScriptRoot rev-parse --show-toplevel).Trim()
$commonDir = (& git -C $PSScriptRoot rev-parse --path-format=absolute --git-common-dir).Trim()
$mainRoot = Split-Path -Parent $commonDir

if (-not $CredsPath) {
  $CredsPath = @((Join-Path $repoRoot 'creds.json'), (Join-Path $mainRoot 'creds.json')) |
    Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $CredsPath) { Fail "creds.json not found in $repoRoot or $mainRoot. Pass -CredsPath <file>." }
}
if (-not (Test-Path -LiteralPath $CredsPath)) { Fail "No file at the -CredsPath given." }

# The creds file must never be committed.
$credsFull = (Resolve-Path -LiteralPath $CredsPath).Path
$credsDir = Split-Path -Parent $credsFull
if ((Quiet { git -C $credsDir rev-parse --is-inside-work-tree }) -eq 0) {
  if ((Quiet { git -C $credsDir ls-files --error-unmatch -- $credsFull }) -eq 0) {
    Fail "$CredsPath is tracked by git. Remove it from the index first: git rm --cached <file>"
  }
  if ((Quiet { git -C $credsDir check-ignore -q -- $credsFull }) -ne 0) {
    Write-Host "WARNING: $CredsPath is not gitignored. Don't 'git add' it." -ForegroundColor Yellow
  }
}

# Parse without ever echoing content: parser errors can quote the file, so they are replaced by a fixed message.
try { $json = Get-Content -Raw -LiteralPath $credsFull -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop }
catch { Fail "creds file is not valid JSON (details hidden so no value is printed)." }

$client = $json.web
if (-not $client) {
  if ($json.installed) { Fail "This is a 'Desktop app' client. Rate 1 needs a 'Web application' OAuth client." }
  Fail "No 'web' section in the creds file."
}

$values = [ordered]@{
  GOOGLE_CLIENT_ID     = [string]$client.client_id
  GOOGLE_CLIENT_SECRET = [string]$client.client_secret
}
foreach ($name in @($values.Keys)) {
  $v = $values[$name].Trim()
  $values[$name] = $v
  if (-not $v) { Fail "$name is empty in the creds file." }
  if ($v -match "[\s'`"]") { Fail "$name contains whitespace or quotes; the server env file can't hold it." }
}
if (-not $values.GOOGLE_CLIENT_ID.EndsWith('.apps.googleusercontent.com')) {
  Fail "GOOGLE_CLIENT_ID doesn't look like a Google OAuth client id."
}
Write-Host "Read GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from the creds file (values not shown)."

# Redirect URIs: Google requires an exact match, path included.
$callbacks = @('/api/auth/callback/google', '/api/gsc/callback')   # sign-in with Google, Search Console grant
$required = foreach ($base in @($AppUrl, $DevUrl)) { foreach ($p in $callbacks) { $base.TrimEnd('/') + $p } }
$registered = @($client.redirect_uris | ForEach-Object { ([string]$_).TrimEnd('/') })
$missing = @($required | Where-Object { $registered -notcontains $_ })
if ($missing.Count) {
  Write-Host ""
  Write-Host "Add these Authorized redirect URIs to the OAuth client in Google Cloud Console" -ForegroundColor Yellow
  Write-Host "(APIs & Services > Credentials > your Web client), then save:" -ForegroundColor Yellow
  $missing | ForEach-Object { Write-Host "  $_" }
  Write-Host "The client id and secret don't change when you do; no need to download the JSON again."
} else {
  Write-Host "Redirect URIs: all registered."
}

# --- Local: api/.env -------------------------------------------------------------------------------------
if ($Local) {
  $envFile = Join-Path $repoRoot 'api\.env'
  if ((Quiet { git -C $repoRoot check-ignore -q -- 'api/.env' }) -ne 0) {
    Fail "api/.env is not gitignored in $repoRoot; refusing to write secrets there."
  }
  if (-not (Test-Path -LiteralPath $envFile)) {
    Copy-Item -LiteralPath (Join-Path $repoRoot 'api\.env.example') -Destination $envFile
    Write-Host "Created api/.env from api/.env.example."
  }
  $pattern = '^\s*(' + (($values.Keys) -join '|') + ')\s*='
  $lines = @(Get-Content -LiteralPath $envFile | Where-Object { $_ -notmatch $pattern })
  foreach ($name in $values.Keys) { $lines += "$name=$($values[$name])" }
  [System.IO.File]::WriteAllLines($envFile, [string[]]$lines, (New-Object System.Text.UTF8Encoding $false))
  Write-Host "Local: wrote $(($values.Keys) -join ', ') to $envFile"
}

# --- GitHub repository secrets ----------------------------------------------------------------------------
if ($GitHub) {
  $ghReady = $false
  if (Get-Command gh -ErrorAction SilentlyContinue) {
    $ghReady = ((Quiet { gh auth status }) -eq 0)
  }

  if ($ghReady) {
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
      $body = ($values.Keys | ForEach-Object { "$_=$($values[$_])" }) -join "`n"
      [System.IO.File]::WriteAllText($tmp, $body, (New-Object System.Text.UTF8Encoding $false))
      & gh secret set --env-file $tmp --repo $Repo
      if ($LASTEXITCODE -ne 0) { Fail "gh secret set failed." }
    } finally {
      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
    Write-Host "GitHub: set $(($values.Keys) -join ', ') on $Repo."
  } else {
    Write-Host ""
    Write-Host "GitHub CLI not installed or not signed in: using the clipboard instead." -ForegroundColor Yellow
    $url = "https://github.com/$Repo/settings/secrets/actions/new"
    Start-Process $url
    Write-Host "Opened $url"
    foreach ($name in $values.Keys) {
      Set-Clipboard -Value $values[$name]
      Write-Host ""
      Write-Host "Copied $name to the clipboard."
      Write-Host "  In the browser: Name = $name, Secret = Ctrl+V, click 'Add secret' (or 'Update' if it exists)."
      Write-Host "  For the next one, open 'New repository secret' again."
      Read-Host "  Press Enter when $name is saved" | Out-Null
    }
    try {
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.Clipboard]::Clear()
    } catch { Set-Clipboard -Value ' ' }
    Write-Host "Clipboard cleared. If Windows clipboard history (Win+V) is on, delete the two entries there too."
  }

  Write-Host ""
  Write-Host "The server gets the secrets on the next deploy: merge to main, or GitHub > Actions > Deploy > Run workflow."
  try {
    $cfg = Invoke-RestMethod -Uri "$($AppUrl.TrimEnd('/'))/api/config" -TimeoutSec 10
    Write-Host "Right now $AppUrl/api/config reports google = $($cfg.google) (true after that deploy)."
  } catch { Write-Host "Couldn't reach $AppUrl/api/config to check." }
}
