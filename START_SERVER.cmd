@echo off
setlocal

cd /d "%~dp0"

set "APP_HOST=127.0.0.1"
set "APP_PORT=3000"
set "DB_HOST=127.0.0.1"
set "DB_PORT=5433"
set "PGDATA_DIR=%CD%\.pgdata"
set "PG_BIN=C:\Program Files\PostgreSQL\18\bin"
set "PG_CTL=%PG_BIN%\pg_ctl.exe"
set "NPM=C:\Program Files\nodejs\npm.cmd"
set "NPX=C:\Program Files\nodejs\npx.cmd"

title Role Engine Server

echo.
echo ========================================
echo   Role Engine - restart local server
echo ========================================
echo Project: %CD%
echo App:     http://%APP_HOST%:%APP_PORT%
echo DB:      %DB_HOST%:%DB_PORT%
echo.

if not exist "%NPM%" (
  echo [ERROR] npm was not found at "%NPM%".
  echo Install Node.js or update START_SERVER.cmd.
  goto fail
)

if not exist "%NPX%" (
  echo [ERROR] npx was not found at "%NPX%".
  echo Install Node.js or update START_SERVER.cmd.
  goto fail
)

echo [1/6] Stopping anything currently listening on port %APP_PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$port=%APP_PORT%; $pids = @(Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); foreach ($pid in $pids) { if ($pid -gt 0) { Write-Host ('Stopping PID ' + $pid); Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } }"
if errorlevel 1 goto fail

echo [2/6] Ensuring PostgreSQL is running...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$hostName='%DB_HOST%'; $port=%DB_PORT%; $deadline=(Get-Date).AddSeconds(2); while ((Get-Date) -lt $deadline) { try { $client = [Net.Sockets.TcpClient]::new(); $client.Connect($hostName, $port); $client.Close(); exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"
if errorlevel 1 (
  if exist "%PGDATA_DIR%\PG_VERSION" (
    if exist "%PG_CTL%" (
      echo Starting local PostgreSQL cluster from "%PGDATA_DIR%"...
      "%PG_CTL%" start -D "%PGDATA_DIR%" -l "%PGDATA_DIR%\server.log" -o "-h %DB_HOST% -p %DB_PORT%"
      if errorlevel 1 (
        echo pg_ctl returned an error. Checking whether PostgreSQL became available anyway...
      )
    ) else (
      echo [WARN] Local .pgdata exists, but pg_ctl was not found at "%PG_CTL%".
      echo [WARN] The script will continue and expect PostgreSQL to already listen on %DB_HOST%:%DB_PORT%.
    )
  ) else (
    echo [WARN] "%PGDATA_DIR%" was not found.
    echo [WARN] The script will continue and expect PostgreSQL to already listen on %DB_HOST%:%DB_PORT%.
  )
) else (
  echo PostgreSQL is already available on %DB_HOST%:%DB_PORT%.
)

echo Waiting for PostgreSQL on %DB_HOST%:%DB_PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$hostName='%DB_HOST%'; $port=%DB_PORT%; $deadline=(Get-Date).AddSeconds(35); while ((Get-Date) -lt $deadline) { try { $client = [Net.Sockets.TcpClient]::new(); $client.Connect($hostName, $port); $client.Close(); exit 0 } catch { Start-Sleep -Milliseconds 500 } }; Write-Host 'PostgreSQL did not answer in time.'; exit 1"
if errorlevel 1 goto fail

echo [3/6] Applying Prisma migrations...
call "%NPX%" prisma migrate deploy
if errorlevel 1 goto fail

echo [4/6] Generating Prisma Client...
call "%NPM%" run prisma:generate
if errorlevel 1 goto fail

echo [5/6] Checking that port %APP_PORT% is free...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$port=%APP_PORT%; if (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue) { Write-Host ('Port ' + $port + ' is still busy.'); exit 1 }"
if errorlevel 1 goto fail

echo [6/6] Starting Next.js dev server...
echo.
echo Open: http://%APP_HOST%:%APP_PORT%
echo Keep this window open while using Role Engine.
echo Press Ctrl+C in this window to stop the server.
echo.
call "%NPM%" run dev -- -H %APP_HOST% -p %APP_PORT%

echo.
echo Server process exited.
pause
exit /b 0

:fail
echo.
echo ========================================
echo   Startup failed
echo ========================================
echo Read the error above. This window will stay open.
pause
exit /b 1
