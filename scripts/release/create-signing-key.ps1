<#
.SYNOPSIS
  Creates the Android release signing key for Qbit Nutrition and stores the four GitHub Actions secrets the release
  workflow reads. Run it yourself, once, in PowerShell. See docs/release.md.

.DESCRIPTION
  - Asks you for a password (typed hidden, twice). The password and the key never appear on screen, in a file inside the
    repository, in shell history, or in any chat.
  - Generates the keystore with keytool from a JDK container (Docker), so no JDK has to be installed.
  - Writes the keystore OUTSIDE the repository (default: %USERPROFILE%\qbit-nutrition-signing).
  - Sends the secrets to GitHub with the GitHub CLI through standard input.
  - Prints the certificate SHA-256 fingerprint, which is public and safe to share.

  Losing the keystore or its password means installed copies of the app can never be updated in place. Back both up
  before you rely on them (docs/release.md, section 4).

.PARAMETER OutDir
  Folder for the keystore. Must not be inside a git working tree.

.PARAMETER SkipSecrets
  Create the keystore only; do not touch GitHub.
#>
[CmdletBinding()]
param(
  [string]$OutDir = (Join-Path $env:USERPROFILE 'qbit-nutrition-signing'),
  [string]$Repo = 'qbitdevz/qbit-nutrition',
  [string]$GitHubUser = 'qbitdevz',
  [string]$Alias = 'qbit-nutrition',
  [string]$DistinguishedName = 'CN=Qbit Nutrition, O=qbitdev',
  [string]$JdkImage = 'eclipse-temurin:17-jdk',
  [switch]$SkipSecrets
)

$ErrorActionPreference = 'Stop'
$keystoreName = 'qbit-nutrition-release.jks'

function Assert-Tool([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw "This script needs '$name' on the PATH." }
}

function ConvertTo-Plain([securestring]$secure) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

Assert-Tool docker
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker is installed but not running. Start Docker Desktop, wait until it is ready, and run this script again.' }
if (-not $SkipSecrets) { Assert-Tool gh }

# The keystore must never land in a git working tree.
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path
$probe = $OutDir
while ($probe) {
  if (Test-Path (Join-Path $probe '.git')) { throw "'$OutDir' is inside a git repository ($probe). Choose a folder outside any repository with -OutDir." }
  $parent = Split-Path $probe -Parent
  if ($parent -eq $probe) { break }
  $probe = $parent
}
$keystorePath = Join-Path $OutDir $keystoreName
if (Test-Path $keystorePath) { throw "A keystore already exists at $keystorePath. This script never overwrites a key. Move it away first if you really want a new one." }

$first = Read-Host -AsSecureString 'Choose a password for the signing key (at least 12 characters)'
$second = Read-Host -AsSecureString 'Type it again'
$password = ConvertTo-Plain $first
if ($password -cne (ConvertTo-Plain $second)) { throw 'The two passwords do not match. Nothing was created.' }
if ($password.Length -lt 12) { throw 'Use at least 12 characters. Nothing was created.' }

try {
  # The password reaches keytool through an environment variable, never on a command line.
  $env:QN_STOREPASS = $password
  Write-Host 'Generating the key (the first run downloads the JDK image)...'
  docker run --rm -e QN_STOREPASS -v "${OutDir}:/out" $JdkImage keytool -genkeypair `
    -keystore "/out/$keystoreName" -storetype PKCS12 -alias $Alias `
    -keyalg RSA -keysize 2048 -validity 10000 -dname $DistinguishedName `
    -storepass:env QN_STOREPASS -keypass:env QN_STOREPASS
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $keystorePath)) { throw 'keytool did not create the keystore.' }

  $listing = docker run --rm -e QN_STOREPASS -v "${OutDir}:/out" $JdkImage keytool -list -v `
    -keystore "/out/$keystoreName" -alias $Alias -storepass:env QN_STOREPASS
  if ($LASTEXITCODE -ne 0) { throw 'The new keystore could not be read back with the password.' }
  $fingerprint = ($listing | Select-String 'SHA256:' | Select-Object -First 1).ToString().Trim()

  if (-not $SkipSecrets) {
    $env:GH_TOKEN = (gh auth token --user $GitHubUser)
    if (-not $env:GH_TOKEN) { throw "The GitHub CLI has no login for '$GitHubUser'. Run: gh auth login" }
    $base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($keystorePath))
    # Values go through standard input, so they are not visible in the process list or in shell history.
    $base64   | gh secret set ANDROID_KEYSTORE_BASE64   --repo $Repo
    $password | gh secret set ANDROID_KEYSTORE_PASSWORD --repo $Repo
    $Alias    | gh secret set ANDROID_KEY_ALIAS         --repo $Repo
    $password | gh secret set ANDROID_KEY_PASSWORD      --repo $Repo
    if ($LASTEXITCODE -ne 0) { throw 'Storing the secrets on GitHub failed. The keystore was created; fix the login and store them by hand (docs/release.md).' }
  }
}
finally {
  $password = $null
  $base64 = $null
  Remove-Item Env:QN_STOREPASS -ErrorAction SilentlyContinue
  Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host "Keystore: $keystorePath"
Write-Host "Alias:    $Alias"
Write-Host "Certificate fingerprint (public, publish it with your releases):"
Write-Host "  $fingerprint"
if (-not $SkipSecrets) { Write-Host "GitHub secrets stored in $Repo." }
Write-Host ''
Write-Host 'NOW, before anything else:'
Write-Host '  1. Save the password in your password manager.'
Write-Host '  2. Copy the keystore file to at least two places that are not this computer (encrypted drive, password manager).'
Write-Host '  Without the file AND the password, the app can never be updated in place again.'
