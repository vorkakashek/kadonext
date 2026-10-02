param(
  [ValidateRange(1, 366)]
  [int]$Days = 30,
  [switch]$Json,
  [string]$RemoteHost = 'root@185.240.103.224'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$reportScript = Join-Path $repositoryRoot 'scripts\report-analytics.mjs'
$sshKey = Join-Path $env:USERPROFILE '.ssh\kado_codex_ed25519'
$sshArguments = @('-i', $sshKey, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10')
$jsonArgument = if ($Json) { ' --json' } else { '' }
$remoteCommand = "node --input-type=module - --dir /var/log/nginx --days $Days$jsonArgument"

if (-not (Test-Path -LiteralPath $sshKey)) {
  throw "Missing production SSH key: $sshKey"
}

if (-not (Test-Path -LiteralPath $reportScript)) {
  throw "Missing analytics report script: $reportScript"
}

Get-Content -LiteralPath $reportScript -Raw | & ssh @sshArguments $RemoteHost $remoteCommand
if ($LASTEXITCODE -ne 0) {
  throw "Could not read production analytics (exit code $LASTEXITCODE)."
}
