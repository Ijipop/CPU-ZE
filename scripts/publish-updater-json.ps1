# Publish updater/latest.json with public GitHub Release download URLs.
# Hard-fails if the GitHub NSIS binary / .sig do not match the local signed build.
#
# Usage (after `gh release create vX.Y.Z ...` with NSIS + sig uploaded):
#   powershell -File scripts/publish-updater-json.ps1 -Tag v0.3.11
#
# If assets on GitHub are wrong/outdated, re-upload local signed artifacts first:
#   powershell -File scripts/publish-updater-json.ps1 -Tag v0.3.11 -UploadLocalAssets

param(
  [Parameter(Mandatory = $true)]
  [string]$Tag,

  [switch]$UploadLocalAssets,

  [switch]$SkipReleaseBranchPush,

  # Optional UTF-8 notes file (avoids PowerShell console mojibake).
  # If omitted, uses the GitHub release body.
  [string]$NotesFile = ""
)

$ErrorActionPreference = "Stop"
$repo = "Ijipop/CPU-ZE"
$version = $Tag.TrimStart("v")
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$localExe = Join-Path $root "src-tauri/target/release/bundle/nsis/CPU-ZE_${version}_x64-setup.exe"
$localSigPath = "$localExe.sig"
$localMsi = Join-Path $root "src-tauri/target/release/bundle/msi/CPU-ZE_${version}_x64_en-US.msi"
$localMsiSig = "$localMsi.sig"

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Assert-File([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label not found: $Path"
  }
}

Assert-File $localExe "Local NSIS installer"
Assert-File $localSigPath "Local NSIS .sig"

$localSig = (Get-Content -LiteralPath $localSigPath -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($localSig)) {
  throw "Local NSIS .sig is empty: $localSigPath"
}

$localSha = Get-Sha256 $localExe
$localSize = (Get-Item -LiteralPath $localExe).Length
Write-Host "Local NSIS: size=$localSize sha256=$localSha"

if ($UploadLocalAssets) {
  Write-Host "Uploading local signed artifacts to $Tag (clobber)..."
  $upload = @($localExe, $localSigPath)
  if ((Test-Path -LiteralPath $localMsi) -and (Test-Path -LiteralPath $localMsiSig)) {
    $upload += @($localMsi, $localMsiSig)
  }
  gh release upload $Tag @upload --clobber
  Write-Host "Upload complete."
}

Write-Host "Resolving release assets for $Tag..."
$release = gh api "repos/$repo/releases/tags/$Tag" | ConvertFrom-Json
$nsis = $release.assets | Where-Object { $_.name -eq "CPU-ZE_${version}_x64-setup.exe" } | Select-Object -First 1
$nsisSigAsset = $release.assets | Where-Object { $_.name -eq "CPU-ZE_${version}_x64-setup.exe.sig" } | Select-Object -First 1
if (-not $nsis) { throw "NSIS asset not found on release $Tag" }
if (-not $nsisSigAsset) { throw "NSIS .sig asset not found on release $Tag" }

$assetUrl = if ($nsis.browser_download_url) {
  $nsis.browser_download_url
} else {
  "https://github.com/$repo/releases/download/$Tag/CPU-ZE_${version}_x64-setup.exe"
}
$sigUrl = if ($nsisSigAsset.browser_download_url) {
  $nsisSigAsset.browser_download_url
} else {
  "https://github.com/$repo/releases/download/$Tag/CPU-ZE_${version}_x64-setup.exe.sig"
}

function Get-AssetSha256([object]$Asset, [string]$DownloadUrl, [string]$Label) {
  if ($Asset.digest -and $Asset.digest -match '^sha256:([0-9a-fA-F]+)$') {
    $sha = $Matches[1].ToUpperInvariant()
    Write-Host "Remote $Label digest (API): $sha size=$($Asset.size)"
    return $sha
  }

  Write-Host "API digest missing for $Label; downloading with cache-bust..."
  $tmp = Join-Path $env:TEMP ("cpu-ze-verify-{0}-{1}" -f $version, [Guid]::NewGuid().ToString("n"))
  $url = "{0}?cb={1}" -f $DownloadUrl, [Guid]::NewGuid().ToString("n")
  Invoke-WebRequest -Uri $url -OutFile $tmp -Headers @{ "Cache-Control" = "no-cache"; "Pragma" = "no-cache" }
  $sha = Get-Sha256 $tmp
  Write-Host "Remote $Label downloaded: size=$((Get-Item $tmp).Length) sha256=$sha"
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  return $sha
}

$remoteSha = Get-AssetSha256 $nsis $assetUrl "NSIS"
if ($remoteSha -ne $localSha) {
  throw @"
SIGNATURE GUARD FAILED: GitHub NSIS does not match local signed build.
  local : $localSha ($localSize bytes)
  remote: $remoteSha ($($nsis.size) bytes)
Re-run with -UploadLocalAssets after a fresh signed build, then publish again.
"@
}

if ([int64]$nsis.size -ne [int64]$localSize) {
  throw "SIGNATURE GUARD FAILED: size mismatch local=$localSize remote=$($nsis.size)"
}

$localSigSha = Get-Sha256 $localSigPath
$remoteSigSha = Get-AssetSha256 $nsisSigAsset $sigUrl "NSIS .sig"
if ($remoteSigSha -ne $localSigSha) {
  throw @"
SIGNATURE GUARD FAILED: GitHub .sig does not match local .sig used for latest.json.
  local : $localSigSha
  remote: $remoteSigSha
Re-run with -UploadLocalAssets so the installer and signature stay a matching pair.
"@
}

if ([int64]$nsisSigAsset.size -ne (Get-Item -LiteralPath $localSigPath).Length) {
  throw "SIGNATURE GUARD FAILED: .sig size mismatch"
}

Write-Host "OK: remote NSIS + .sig match local signed artifacts."
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

$notes = $null
if ($NotesFile) {
  Assert-File $NotesFile "Notes file"
  $notes = [System.IO.File]::ReadAllText((Resolve-Path $NotesFile), [System.Text.UTF8Encoding]::new($false)).Trim()
}
if ([string]::IsNullOrWhiteSpace($notes)) {
  if ($release.body -and $release.body.Trim().Length -gt 0) {
    $notes = $release.body.Trim()
  } else {
    $notes = "CPU-ZE v$version"
  }
}
if ($notes.Length -gt 4000) {
  $notes = $notes.Substring(0, 4000).Trim() + "`n…"
}

$obj = [ordered]@{
  version = $version
  notes = $notes
  pub_date = $pubDate
  platforms = [ordered]@{
    "windows-x86_64" = [ordered]@{
      signature = $localSig
      url = $assetUrl
    }
  }
}

$dir = Join-Path $root "updater"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$path = Join-Path $dir "latest.json"
$utf8 = New-Object System.Text.UTF8Encoding $false
$json = $obj | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($path, $json, $utf8)
Write-Host "Wrote $path"
Write-Host "  url=$assetUrl"
Write-Host "  sha256=$localSha"

gh release upload $Tag $path --clobber
Write-Host "Uploaded latest.json to $Tag"

if (-not $SkipReleaseBranchPush) {
  Write-Host "Updating branch 'release' so raw endpoint stays current..."
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $work = Join-Path $env:TEMP "cpu-ze-release-$stamp"
  git fetch origin release
  git worktree add -B release $work origin/release
  try {
    Copy-Item -LiteralPath $path -Destination (Join-Path $work "updater/latest.json") -Force
    Push-Location $work
    git add updater/latest.json
    $pending = git status --porcelain -- updater/latest.json
    if ($pending) {
      git commit -m "chore: sync updater latest.json for $Tag (sha $localSha)"
      git push origin release
      Write-Host "Pushed updater/latest.json to origin/release"
    } else {
      Write-Host "release branch already has identical latest.json"
    }
  } finally {
    Pop-Location -ErrorAction SilentlyContinue
    git worktree remove -f $work
  }
}

Write-Host "Done. Updater pair verified: exe sha256=$localSha"
