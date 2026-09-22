param(
  [string]$RemoteHost = 'root@185.240.103.224'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$sshKey = Join-Path $env:USERPROFILE '.ssh\kado_codex_ed25519'
$sshArguments = @('-i', $sshKey, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10')

Set-Location $repositoryRoot

if (-not (Test-Path -LiteralPath $sshKey)) {
  throw "Missing production SSH key: $sshKey"
}

$securePassword = Read-Host 'Enter the mailbox password for hello@kadonext.com' -AsSecureString
$credential = [System.Net.NetworkCredential]::new('', $securePassword)
$plainPassword = $credential.Password
if ([string]::IsNullOrEmpty($plainPassword)) {
  throw 'The password cannot be empty.'
}

try {
  $encodedPassword = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($plainPassword))
  $remoteCommand = @'
set -eu
IFS= read -r encoded_password
env_file=/etc/kado/contact.env
temp_file=$(mktemp /etc/kado/contact.env.XXXXXX)
grep -v -E '^CONTACT_SMTP_PASS(_BASE64)?=' "$env_file" > "$temp_file"
printf 'CONTACT_SMTP_PASS_BASE64=%s\n' "$encoded_password" >> "$temp_file"
chown root:root "$temp_file"
chmod 0600 "$temp_file"
mv -f "$temp_file" "$env_file"
systemctl restart kado-contact.service
systemctl is-active --quiet kado-contact.service
'@

  Write-Host 'Saving the SMTP password on the production server...'
  $encodedPassword | & ssh @sshArguments $RemoteHost $remoteCommand
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not save the SMTP password or restart the contact API.'
  }

  Write-Host 'SMTP password saved. Sending a test enquiry...'
  & node scripts/test-production-contact.mjs
  if ($LASTEXITCODE -ne 0) {
    throw 'SMTP is configured, but the test enquiry was not accepted.'
  }
}
finally {
  $plainPassword = $null
  $encodedPassword = $null
  $credential = $null
  $securePassword = $null
}
