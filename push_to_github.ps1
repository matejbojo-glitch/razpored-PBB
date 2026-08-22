Param(
  [string]$RemoteUrl = "https://github.com/matejbojo-glitch/razpored-PBB.git",
  [string]$Branch = "fix/imenik-parafe"
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Path $MyInvocation.MyCommand.Definition -Parent)
# Move to repo root (assumes script is in project root)
$root = Get-Location
Write-Host "Project root: $root"

# Init git if needed
if (-not (Test-Path .git)) {
  Write-Host "Initializing new git repository..."
  git init
}

# Ensure user identity
try { git config user.name > $null } catch {}
if (-not (git config user.name)) {
  git config user.name "Your Name"
  git config user.email "you@example.com"
  Write-Host "Set git user.name and user.email to placeholders — please update them if necessary."
}

# Create branch
git checkout -B $Branch

# Add changed files (adjust list if needed)
git add nav.js imenik.html serve_ps_http.ps1 supabase_delete_dijana.sql

# Commit
$msg = "Imenik: add Parafe admin view; primary dept first; normalize ZO→ŽO; add local /login server"
try {
  git commit -m $msg
} catch {
  Write-Host "Nothing to commit or commit failed: $_"
}

# Add remote if not present or different
$existing = git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0 -or $existing -ne $RemoteUrl) {
  try { git remote remove origin } catch {}
  git remote add origin $RemoteUrl
  Write-Host "Added remote origin -> $RemoteUrl"
} else {
  Write-Host "Remote origin already set to $existing"
}

Write-Host "About to push branch '$Branch' to origin. You may be prompted for credentials (use GitHub PAT if needed)."
git push -u origin $Branch
Write-Host 'Done. Open a Pull Request on GitHub if desired.'
