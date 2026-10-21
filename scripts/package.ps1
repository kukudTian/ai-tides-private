param(
  [string]$SiteUrl = "https://ai-blog.cloud"
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$OutputsRoot = Split-Path -Parent $ProjectRoot
$Node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $Node) { $Node = 'D:\node.exe' }

if ($SiteUrl) {
  $env:SITE_URL = $SiteUrl
} elseif (-not $env:SITE_URL) {
  $env:SITE_URL = 'https://ai-blog.cloud'
}
Write-Host "SITE_URL=$env:SITE_URL"

Push-Location $ProjectRoot
try {
  & $Node scripts/build-templates.js
  if ($LASTEXITCODE -ne 0) { throw 'build-templates.js failed' }

  & $Node scripts/build-seed.js
  if ($LASTEXITCODE -ne 0) { throw 'build-seed.js failed' }

  & $Node scripts/export-static.js
  if ($LASTEXITCODE -ne 0) { throw 'export-static.js failed' }
} finally {
  Pop-Location
}

$Release = Join-Path $ProjectRoot 'release'
$ReleaseRoot = [System.IO.Path]::GetFullPath($Release)
$CloudStaging = Join-Path $Release 'ai-tides-cloudflare'
$CloudStagingRoot = [System.IO.Path]::GetFullPath($CloudStaging)
if (-not $CloudStagingRoot.StartsWith($ReleaseRoot + [System.IO.Path]::DirectorySeparatorChar)) {
  throw "release path unsafe: $CloudStagingRoot"
}

# 旧版打包目录只留 ai-tides-cloudflare，其余全部清理。
foreach ($name in @('ai-tides-upload', 'ai-tides-server', 'ai-tides-full-bundle')) {
  $target = Join-Path $Release $name
  $fullTarget = [System.IO.Path]::GetFullPath($target)
  if (-not $fullTarget.StartsWith($ReleaseRoot + [System.IO.Path]::DirectorySeparatorChar)) {
    throw "release path unsafe: $fullTarget"
  }
  if (Test-Path -LiteralPath $fullTarget) {
    Remove-Item -LiteralPath $fullTarget -Recurse -Force
  }
}

if (Test-Path -LiteralPath $CloudStagingRoot) {
  Remove-Item -LiteralPath $CloudStagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $CloudStagingRoot | Out-Null

# Cloudflare Pages + D1 单包：dist 和 functions 同级，wrangler 部署时一起上传。
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'dist') -Destination $CloudStagingRoot -Recurse
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'cloudflare\functions') -Destination $CloudStagingRoot -Recurse
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'cloudflare\wrangler.toml') -Destination $CloudStagingRoot
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'cloudflare\README-cloudflare.md') -Destination $CloudStagingRoot
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'README.md') -Destination $CloudStagingRoot
Copy-Item -LiteralPath (Join-Path $ProjectRoot '.env.example') -Destination $CloudStagingRoot

foreach ($name in @('docs', 'prompts', 'data')) {
  $src = Join-Path $ProjectRoot $name
  if (Test-Path -LiteralPath $src) {
    Copy-Item -LiteralPath $src -Destination $CloudStagingRoot -Recurse
  }
}

$dstScripts = Join-Path $CloudStagingRoot 'scripts'
New-Item -ItemType Directory -Path $dstScripts | Out-Null
foreach ($name in @('example-push.js', 'xiaolongxia-worker.js')) {
  $src = Join-Path (Join-Path $ProjectRoot 'scripts') $name
  if (Test-Path -LiteralPath $src) {
    Copy-Item -LiteralPath $src -Destination (Join-Path $CloudStagingRoot 'scripts') -Force
  }
}

$srcLib = Join-Path $ProjectRoot 'scripts\lib'
$dstLib = Join-Path $CloudStagingRoot 'scripts\lib'
if (Test-Path -LiteralPath $srcLib) {
  Copy-Item -LiteralPath $srcLib -Destination $dstLib -Recurse
}

# 清理旧压缩包，只保留新的单包。
foreach ($name in @(
  'ai-tides-cloudflare-pages.zip',
  'ai-tides-cloudflare-upload.zip',
  'ai-tides-server-full.zip',
  'AI-Tides-Full-Bundle.zip',
  'AI-Tides-Deploy-Guide.md',
  'xiaolongxia-publish-prompt.txt'
)) {
  $target = Join-Path $OutputsRoot $name
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Force
  }
}

$CloudZip = Join-Path $OutputsRoot 'AI-Tides-Cloudflare-Pages.zip'
if (Test-Path -LiteralPath $CloudZip) { Remove-Item -LiteralPath $CloudZip -Force }
Compress-Archive -Path (Join-Path $CloudStagingRoot '*') -DestinationPath $CloudZip -CompressionLevel Optimal

Write-Host "Cloudflare Pages package: $CloudZip"
Get-Item -LiteralPath $CloudZip | Select-Object FullName, Length
