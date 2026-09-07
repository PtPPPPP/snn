$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& node -e "if(Number(process.versions.node.split('.')[0])!==24)process.exit(1)"
if ($LASTEXITCODE -ne 0) { throw 'Install Node.js 24.16.0 as specified in .nvmrc.' }
if (-not (Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed; check network and Node version.' }
}
Write-Host 'Keep this terminal running. Open http://127.0.0.1:5173/play/rocket/train'
& node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
if ($LASTEXITCODE -ne 0) { throw 'Preview stopped with an error. Check port 5173 and the output above.' }
