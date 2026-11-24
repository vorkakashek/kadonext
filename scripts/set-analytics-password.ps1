param(
  [string]$RemoteHost = 'root@185.240.103.224',
  [string]$Login = 'benier@bk.ru',
  [Security.SecureString]$Password
)

$ErrorActionPreference = 'Stop'
if ($Login -cnotmatch '\A[A-Za-z0-9][A-Za-z0-9@._+\-]{0,253}\z') {
  throw 'Use a login containing only letters, digits, @, dot, underscore, plus or hyphen.'
}
$encodedLogin = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($Login))
$sshKey = Join-Path $env:USERPROFILE '.ssh\kado_codex_ed25519'
if (-not (Test-Path -LiteralPath $sshKey -PathType Leaf)) {
  throw "Missing production SSH key: $sshKey"
}

if (-not $Password) {
  $Password = Read-Host "New password for $Login (16-72 printable ASCII characters, no spaces)" -AsSecureString
}
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  if ($plainPassword -cnotmatch '\A[!-~]{16,72}\z') {
    throw 'Use 16-72 printable ASCII characters without spaces.'
  }
  $encodedPassword = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($plainPassword))
} finally {
  $plainPassword = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}

# Send the password over SSH stdin, separate from the command line and shell code.
$remoteScript = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\ops\analytics\set-dashboard-password.sh') -Raw
$payload = "IFS= read -r encoded_login`n$encodedLogin`nIFS= read -r encoded_password`n$encodedPassword`n" + $remoteScript.Replace("`r`n", "`n") + "`n"
try {
  # nginx writes successful configuration checks to stderr. Windows PowerShell
  # must use SSH's exit code instead of treating that diagnostic as a failure.
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $payload | & ssh -i $sshKey -o BatchMode=yes -o ConnectTimeout=10 $RemoteHost 'bash -se' 2>&1 |
      ForEach-Object { $_.ToString() }
    $sshExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($sshExitCode -ne 0) { throw "Could not set the analytics password (SSH exit code $sshExitCode)." }
} finally {
  $payload = $null
  $encodedPassword = $null
}
