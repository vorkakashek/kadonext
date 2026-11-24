param([switch]$BuildOnly)

# Compatibility entry point: all production builds now use the VPS.
$ErrorActionPreference = 'Stop'
Push-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
try {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw "Production build failed (exit code $LASTEXITCODE)." }
  if (-not $BuildOnly) {
    & (Join-Path $PSScriptRoot 'deploy-production.ps1') -SkipBuild
  }
} finally { Pop-Location }
