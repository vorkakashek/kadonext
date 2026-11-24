param(
  [switch]$Deploy
)

$ErrorActionPreference = 'Stop'
$sshKey = Join-Path $env:USERPROFILE '.ssh\kado_codex_ed25519'
$repairFile = Join-Path $PSScriptRoot '..\ops\repair-production-tls.sh'
foreach ($path in @($sshKey, $repairFile)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing TLS repair file: $path"
  }
}
if ($Deploy -and -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '..\.output\public\index.html') -PathType Leaf)) {
  throw 'Missing production build. Run npm run build before requesting deployment.'
}

Write-Host 'Renewing the KADO certificate and checking VPS HTTPS...'
$repair = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $repairFile)).Replace("`r`n", "`n")
$repair | & ssh -i $sshKey -o BatchMode=yes -o ConnectTimeout=10 root@185.240.103.224 'bash -se'
if ($LASTEXITCODE -ne 0) {
  throw "TLS repair/check failed (exit code $LASTEXITCODE). See the server output above. Deployment was not started."
}

if ($Deploy) {
  Write-Host 'HTTPS checks passed. Deploying the prepared production build...'
  & (Join-Path $PSScriptRoot 'deploy-production.ps1') -SkipBuild
} else {
  Write-Host 'VPS HTTPS checks passed. No deployment was requested.'
}
