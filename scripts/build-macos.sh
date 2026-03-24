#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo ""
echo "========================================="
echo "  Building Almanac for macOS"
echo "========================================="
echo ""

# ── Step 1: Check prerequisites ──────────────────────────────────────

echo "[1/5] Checking prerequisites..."

if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required. Install from https://nodejs.org" >&2
  exit 1
fi

if ! command -v python3 &>/dev/null; then
  echo "Error: Python 3 is required. Install from https://www.python.org" >&2
  exit 1
fi

# Ensure PyInstaller is available
if ! python3 -m PyInstaller --version &>/dev/null; then
  echo "  Installing PyInstaller..."
  pip3 install pyinstaller --quiet --break-system-packages 2>/dev/null \
    || pip3 install pyinstaller --quiet
fi

echo "  Node.js:     $(node --version)"
echo "  Python:      $(python3 --version)"
echo "  PyInstaller: $(python3 -m PyInstaller --version 2>/dev/null)"
echo ""

# ── Step 2: Compile Python scripts into standalone binaries ──────────

echo "[2/5] Compiling Python scripts into standalone binaries..."

PYINSTALLER_WORK="$ROOT_DIR/.pyinstaller-work"
PYINSTALLER_DIST="$ROOT_DIR/.pyinstaller-dist"
rm -rf "$PYINSTALLER_WORK" "$PYINSTALLER_DIST"
mkdir -p "$PYINSTALLER_WORK" "$PYINSTALLER_DIST"

# parse_manifest.py — standalone, no local imports
echo "  Building parse_manifest..."
python3 -m PyInstaller \
  --onefile \
  --clean \
  --name parse_manifest \
  --distpath "$PYINSTALLER_DIST" \
  --workpath "$PYINSTALLER_WORK/parse_manifest" \
  --specpath "$PYINSTALLER_WORK" \
  --log-level WARN \
  "$ROOT_DIR/scripts/parse_manifest.py"

# scan_airflow_dags.py — imports from dbt_select.py (same directory)
echo "  Building scan_airflow_dags..."
python3 -m PyInstaller \
  --onefile \
  --clean \
  --name scan_airflow_dags \
  --paths "$ROOT_DIR/scripts" \
  --hidden-import dbt_select \
  --distpath "$PYINSTALLER_DIST" \
  --workpath "$PYINSTALLER_WORK/scan_airflow_dags" \
  --specpath "$PYINSTALLER_WORK" \
  --log-level WARN \
  "$ROOT_DIR/scripts/scan_airflow_dags.py"

# Copy binaries to build/scripts/ for electron-builder to pick up
mkdir -p "$ROOT_DIR/build/scripts"
cp "$PYINSTALLER_DIST/parse_manifest" "$ROOT_DIR/build/scripts/"
cp "$PYINSTALLER_DIST/scan_airflow_dags" "$ROOT_DIR/build/scripts/"

# Clean up PyInstaller temp files
rm -rf "$PYINSTALLER_WORK" "$PYINSTALLER_DIST"

echo "  Binaries ready in build/scripts/"
echo ""

# ── Step 3: Install Node dependencies ────────────────────────────────

echo "[3/5] Installing Node dependencies..."
npm ci --silent 2>/dev/null || npm install --silent
echo ""

# ── Step 4: Build frontend + Electron TypeScript ─────────────────────

echo "[4/5] Building frontend and Electron..."
npm run build
echo ""

# ── Step 5: Package with electron-builder ────────────────────────────

echo "[5/5] Packaging macOS app..."
npx electron-builder --mac
echo ""

echo "========================================="
echo "  Build complete!"
echo "  Output: release/"
echo "========================================="
echo ""
ls -la "$ROOT_DIR/release/"*.dmg 2>/dev/null || ls -la "$ROOT_DIR/release/" 2>/dev/null
