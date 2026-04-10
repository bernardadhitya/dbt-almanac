@echo off
setlocal EnableDelayedExpansion
set "ROOT_DIR=%~dp0.."

echo.
echo =========================================
echo   Building Almanac for Windows
echo =========================================
echo.

:: ── Step 1: Check prerequisites ──────────────────────────────────────

echo [1/5] Checking prerequisites...

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is required. Install from https://nodejs.org 1>&2
    exit /b 1
)

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python 3 is required. Install from https://www.python.org 1>&2
    exit /b 1
)

python -m PyInstaller --version >nul 2>&1
if %errorlevel% neq 0 (
    echo   Installing PyInstaller...
    pip install pyinstaller --quiet
    if %errorlevel% neq 0 (
        echo Error: Failed to install PyInstaller 1>&2
        exit /b 1
    )
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
for /f "tokens=*" %%i in ('python --version') do set PY_VER=%%i
for /f "tokens=*" %%i in ('python -m PyInstaller --version') do set PYI_VER=%%i
echo   Node.js:     %NODE_VER%
echo   Python:      %PY_VER%
echo   PyInstaller: %PYI_VER%
echo.

:: ── Step 2: Compile Python scripts into standalone binaries ──────────

echo [2/5] Compiling Python scripts into standalone binaries...

set "PYINSTALLER_WORK=%ROOT_DIR%\.pyinstaller-work"
set "PYINSTALLER_DIST=%ROOT_DIR%\.pyinstaller-dist"

if exist "%PYINSTALLER_WORK%" rmdir /s /q "%PYINSTALLER_WORK%"
if exist "%PYINSTALLER_DIST%" rmdir /s /q "%PYINSTALLER_DIST%"
mkdir "%PYINSTALLER_WORK%"
mkdir "%PYINSTALLER_DIST%"

echo   Building parse_manifest...
python -m PyInstaller ^
  --onefile ^
  --clean ^
  --name parse_manifest ^
  --distpath "%PYINSTALLER_DIST%" ^
  --workpath "%PYINSTALLER_WORK%\parse_manifest" ^
  --specpath "%PYINSTALLER_WORK%" ^
  --log-level WARN ^
  "%ROOT_DIR%\scripts\parse_manifest.py"
if %errorlevel% neq 0 (
    echo Error: Failed to compile parse_manifest.py 1>&2
    exit /b 1
)

echo   Building scan_airflow_dags...
python -m PyInstaller ^
  --onefile ^
  --clean ^
  --name scan_airflow_dags ^
  --paths "%ROOT_DIR%\scripts" ^
  --hidden-import dbt_select ^
  --distpath "%PYINSTALLER_DIST%" ^
  --workpath "%PYINSTALLER_WORK%\scan_airflow_dags" ^
  --specpath "%PYINSTALLER_WORK%" ^
  --log-level WARN ^
  "%ROOT_DIR%\scripts\scan_airflow_dags.py"
if %errorlevel% neq 0 (
    echo Error: Failed to compile scan_airflow_dags.py 1>&2
    exit /b 1
)

if not exist "%ROOT_DIR%\build\scripts" mkdir "%ROOT_DIR%\build\scripts"
copy "%PYINSTALLER_DIST%\parse_manifest.exe" "%ROOT_DIR%\build\scripts\" >nul
copy "%PYINSTALLER_DIST%\scan_airflow_dags.exe" "%ROOT_DIR%\build\scripts\" >nul

rmdir /s /q "%PYINSTALLER_WORK%"
rmdir /s /q "%PYINSTALLER_DIST%"

echo   Binaries ready in build\scripts\
echo.

:: ── Step 3: Install Node dependencies ────────────────────────────────

echo [3/5] Installing Node dependencies...
cd /d "%ROOT_DIR%"
call npm ci --silent 2>nul
if %errorlevel% neq 0 call npm install --silent
echo.

:: ── Step 4: Build frontend + Electron TypeScript ─────────────────────

echo [4/5] Building frontend and Electron...
call npm run build
if %errorlevel% neq 0 (
    echo Error: npm run build failed 1>&2
    exit /b 1
)
echo.

:: ── Step 5: Package with electron-builder ────────────────────────────

echo [5/5] Packaging Windows app...
call npx electron-builder --win --x64
if %errorlevel% neq 0 (
    echo Error: electron-builder failed 1>&2
    exit /b 1
)
echo.

echo =========================================
echo   Build complete!
echo   Output: release\
echo =========================================
echo.
dir "%ROOT_DIR%\release\*.exe" 2>nul
dir "%ROOT_DIR%\release\*.zip" 2>nul
