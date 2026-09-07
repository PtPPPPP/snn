$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (Test-Path -LiteralPath '.git') { Write-Host 'Git already exists; no changes made.'; exit 0 }
if (-not (Test-Path -LiteralPath '../history.bundle')) { throw 'history.bundle missing next to snn folder' }
& git init
if ($LASTEXITCODE -ne 0) { throw 'git init failed' }
& git fetch ../history.bundle HEAD
if ($LASTEXITCODE -ne 0) { throw 'bundle fetch failed' }
& git reset --mixed FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw 'restore index failed' }
& git remote add origin https://github.com/PtPPPPP/snn.git
Write-Host 'History restored; snapshot files and uncommitted changes retained.'
& git status --short
