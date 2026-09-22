param(
  [string]$RemoteHost = 'root@185.240.103.224'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$sshKey = Join-Path $env:USERPROFILE '.ssh\kado_codex_ed25519'
$remoteDirectory = '/opt/kado-contact'
$archiveName = "kado-contact-api-$(Get-Date -Format 'yyyyMMddHHmmss').tar.gz"
$archivePath = Join-Path ([IO.Path]::GetTempPath()) $archiveName
$remoteArchive = "/tmp/$archiveName"
$sshArguments = @('-i', $sshKey, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10')

Set-Location $repositoryRoot

if (-not (Test-Path -LiteralPath $sshKey)) {
  throw "Missing production SSH key: $sshKey"
}

try {
  Write-Host 'Running focused contact tests...'
  & npm run contact:test
  if ($LASTEXITCODE -ne 0) {
    throw "Contact tests failed with exit code $LASTEXITCODE."
  }

  Write-Host 'Packing contact API...'
  & tar -czf $archivePath contact-api package.json package-lock.json
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create contact API archive (exit code $LASTEXITCODE)."
  }

  Write-Host 'Uploading contact API...'
  & scp @sshArguments $archivePath "${RemoteHost}:$remoteArchive"
  if ($LASTEXITCODE -ne 0) {
    throw "Contact API upload failed with exit code $LASTEXITCODE."
  }

  $backupStamp = Get-Date -Format 'yyyyMMddHHmmss'
  $activateCommand = @(
    'set -eu'
    'test -d /opt/kado-contact/contact-api'
    "backup='/opt/kado-contact/backups/$backupStamp'"
    'mkdir -p "$backup"'
    'cp -a /opt/kado-contact/contact-api "$backup/"'
    "tar -xzf '$remoteArchive' -C '$remoteDirectory'"
    'chown -R root:root /opt/kado-contact/contact-api'
    'find /opt/kado-contact/contact-api -type f -exec chmod 0644 {} +'
    ('if systemctl restart kado-contact.service && systemctl is-active --quiet kado-contact.service; then rm -f ''{0}''; else rm -rf /opt/kado-contact/contact-api; cp -a "$backup/contact-api" /opt/kado-contact/contact-api; systemctl restart kado-contact.service; exit 1; fi' -f $remoteArchive)
  ) -join '; '

  Write-Host 'Activating contact API with rollback protection...'
  & ssh @sshArguments $RemoteHost $activateCommand
  if ($LASTEXITCODE -ne 0) {
    throw 'Contact API activation failed; the previous version was restored.'
  }

  # Give systemd a brief moment to bind the loopback socket, then check the
  # public nginx route. GET creates a harmless one-time anti-spam challenge.
  Start-Sleep -Milliseconds 750
  $health = (& curl.exe -fsS -H 'Origin: https://kadonext.com' 'https://kadonext.com/api/contact') -join "`n"
  if ($LASTEXITCODE -ne 0 -or $health -notmatch '"token"\s*:') {
    throw 'Contact API health check failed: challenge token was not returned.'
  }

  Write-Host 'Contact API deploy complete.'
}
finally {
  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }
}
