# Publish updater/latest.json with public GitHub Release download URLs.
# Usage (after `gh release create vX.Y.Z ...` with NSIS + sig uploaded):
#   powershell -File scripts/publish-updater-json.ps1 -Tag v0.3.2

param(
  [Parameter(Mandatory = $true)]
  [string]$Tag
)

$ErrorActionPreference = "Stop"
$repo = "Ijipop/CPU-ZE"
$version = $Tag.TrimStart("v")

Write-Host "Resolving assets for $Tag..."
$release = gh api "repos/$repo/releases/tags/$Tag" | ConvertFrom-Json
$nsis = $release.assets | Where-Object { $_.name -eq "CPU-ZE_${version}_x64-setup.exe" } | Select-Object -First 1
$sig = Get-Content -Raw "src-tauri/target/release/bundle/nsis/CPU-ZE_${version}_x64-setup.exe.sig"
if (-not $nsis) { throw "NSIS asset not found on release $Tag" }
if (-not $sig) { throw "Local .sig not found for $version" }

$sig = $sig.Trim()
$assetUrl = if ($nsis.browser_download_url) {
  $nsis.browser_download_url
} else {
  "https://github.com/$repo/releases/download/$Tag/CPU-ZE_${version}_x64-setup.exe"
}
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

$obj = [ordered]@{
  version = $version
  notes = "CPU-ZE v$version"
  pub_date = $pubDate
  platforms = [ordered]@{
    "windows-x86_64" = [ordered]@{
      signature = $sig
      url = $assetUrl
    }
  }
}

$dir = Join-Path (Get-Location) "updater"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$path = Join-Path $dir "latest.json"
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($path, ($obj | ConvertTo-Json -Depth 6), $utf8)
Write-Host "Wrote $path -> $assetUrl"

gh release upload $Tag $path --clobber
Write-Host "Uploaded latest.json to $Tag"
Write-Host "Commit+push updater/latest.json on branch release so the raw endpoint stays current."
