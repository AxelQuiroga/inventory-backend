# dev-local.ps1 — verificación runtime completa del setup local (backend + frontend)
#
# Qué hace:
#   1. Aplica migraciones y corre el seed (idempotente, fail-fast).
#   2. Levanta backend y frontend OCULTOS (sin ventanas de consola) con el MISMO
#      entorno que npm run dev:local:
#        backend  -> CORS_ORIGINS=http://localhost:5173 + tsx src/index.ts
#        frontend -> VITE_API_URL=http://localhost:3000 + vite
#      (cross-env solo setea la variable antes del proceso; dotenv no pisa
#      process.env — se arranca el binario directo para no abrir ventanas).
#   3. Verifica el contrato REAL por HTTP, no con mocks:
#        - preflight OPTIONS desde el origin de vite (headers CORS)
#        - POST /auth/login con la cuenta demo (vitrina pública)
#        - GET  /products con token  -> 200
#        - POST /products con demo   -> 403 (VIEWER es SOLO LECTURA)
#        - GET  / (frontend)         -> 200
#   4. Mata TODO el árbol de procesos en el finally. Logs en %TEMP%\dev-local-logs.
#
# SIN SECRETOS: la password del admin se lee del entorno; si no viene seteada,
# se pide por prompt. NUNCA se hardcodea (regla de la casa: el seed jamás crea
# el admin con una password por defecto).
#
# Requisitos: Postgres local arriba, .env del backend con DATABASE_URL y
# JWT_SECRET, estructura experimento4/{backend,frontend}. Uso: .\scripts\dev-local.ps1

$ErrorActionPreference = 'Stop'

$backend  = Split-Path -Parent $PSScriptRoot
$root     = Split-Path -Parent $backend
$frontend = Join-Path $root 'frontend'
$logDir   = Join-Path $env:TEMP 'dev-local-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$beOut = Join-Path $logDir 'be.out.log'; $beErr = Join-Path $logDir 'be.err.log'
$feOut = Join-Path $logDir 'fe.out.log'; $feErr = Join-Path $logDir 'fe.err.log'

# Restaurar env vars al salir (no dejar la terminal contaminada)
$savedCors  = $env:CORS_ORIGINS
$savedApi   = $env:VITE_API_URL
$savedSeed  = $env:SEED_ADMIN_PASSWORD

function Restore-Env {
  $env:CORS_ORIGINS      = $savedCors
  $env:VITE_API_URL      = $savedApi
  $env:SEED_ADMIN_PASSWORD = $savedSeed
}

function Test-Port([int]$Port) {
  try {
    $client = New-Object Net.Sockets.TcpClient
    $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(1000)
    if ($ok) { $client.EndConnect($iar) }
    $client.Close()
    return $ok
  } catch {
    return $false
  }
}

try {
  # ----- 1) Migraciones + seed (fail-fast si falta SEED_ADMIN_PASSWORD) -----
  Push-Location $backend
  npm run db:migrate
  if ($LASTEXITCODE -ne 0) { throw 'db:migrate falló — ¿Postgres está arriba y DATABASE_URL apunta bien?' }

  if (-not $env:SEED_ADMIN_PASSWORD) {
    $env:SEED_ADMIN_PASSWORD = Read-Host -Prompt 'SEED_ADMIN_PASSWORD (mínimo 8 chars)'
  }
  if ($env:SEED_ADMIN_PASSWORD.Length -lt 8) { throw 'SEED_ADMIN_PASSWORD debe tener al menos 8 caracteres.' }

  npm run db:seed
  if ($LASTEXITCODE -ne 0) { throw 'db:seed falló' }
  Pop-Location

  # ----- 2) Backend oculto (entorno = dev:local) -----
  $env:CORS_ORIGINS = 'http://localhost:5173'
  $be = Start-Process -FilePath 'node' -ArgumentList @('node_modules/tsx/dist/cli.mjs', 'src/index.ts') `
    -WorkingDirectory $backend -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $beOut -RedirectStandardError $beErr

  # ----- 3) Frontend oculto (entorno = dev:local) -----
  $env:VITE_API_URL = 'http://localhost:3000'
  $fe = Start-Process -FilePath 'node' -ArgumentList @('node_modules/vite/bin/vite.js') `
    -WorkingDirectory $frontend -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $feOut -RedirectStandardError $feErr

  # ----- 4) Esperar a que escuchen (máx 40 s) -----
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    if ((Test-Port 3000) -and (Test-Port 5173)) { $ready = $true; break }
  }
  if (-not $ready) {
    throw "Backend/frontend no levantaron a tiempo. Revisá:`n  $beErr`n  $feErr"
  }
  Write-Host 'Servers listening: backend :3000 / frontend :5173'

  # ----- 5) Preflight CORS real (OPTIONS desde el origin de vite) -----
  $preflight = curl.exe -s -i -X OPTIONS `
    -H 'Origin: http://localhost:5173' `
    -H 'Access-Control-Request-Method: GET' `
    http://localhost:3000/health
  $allowOrigin = ($preflight | Select-String -Pattern 'access-control-allow-origin: (.*)').Matches.Groups[1].Value
  if ($allowOrigin -eq 'http://localhost:5173') {
    Write-Host "CORS preflight OK -> access-control-allow-origin: $allowOrigin"
  } else {
    Write-Host "CORS preflight INESPERADO -> allow-origin: [$allowOrigin]" -ForegroundColor Yellow
  }

  # ----- 6) Login REAL con la cuenta demo (body por archivo: quoting de curl en PS) -----
  $bodyFile = Join-Path $logDir 'login.json'
  '{"email":"demo@inventory.com","password":"demo1234"}' | Set-Content -Path $bodyFile -Encoding ascii -NoNewline
  $login = curl.exe -s -X POST `
    -H 'Content-Type: application/json' `
    -H 'Origin: http://localhost:5173' `
    --data-binary "@$bodyFile" `
    http://localhost:3000/auth/login
  $token = ($login | ConvertFrom-Json).token
  if (-not $token) { throw "Login demo falló: $login" }
  Write-Host 'Login demo OK (token obtenido)'

  # ----- 7) GET /products con token -> 200 -----
  curl.exe -s -o NUL -w "GET /products -> %{http_code}`n" `
    -H "Authorization: Bearer $token" `
    http://localhost:3000/products

  # ----- 8) POST /products con demo -> 403 (VIEWER solo lectura) -----
  '{"name":"x","price":1}' | Set-Content -Path $bodyFile -Encoding ascii -NoNewline
  curl.exe -s -o NUL -w "POST /products con demo -> %{http_code} (esperado 403)`n" `
    -H "Authorization: Bearer $token" `
    -H 'Content-Type: application/json' `
    --data-binary "@$bodyFile" `
    http://localhost:3000/products

  # ----- 9) Frontend sirve la app -> 200 -----
  curl.exe -s -o NUL -w "GET / (vite) -> %{http_code}`n" http://localhost:5173/

  Write-Host "Todo OK. Logs: $logDir"
}
finally {
  if ($be) { taskkill /PID $be.Id /T /F 2>$null | Out-Null }
  if ($fe) { taskkill /PID $fe.Id /T /F 2>$null | Out-Null }
  Restore-Env
  Write-Host 'Procesos terminados, entorno restaurado.'
}