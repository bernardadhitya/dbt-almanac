import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { spawn, execSync } from 'child_process';
import Store from 'electron-store';
import * as yaml from 'js-yaml';

const GITHUB_OWNER = 'bernardadhitya';
const GITHUB_REPO = 'dbt-almanac';

const store = new Store({
  defaults: {
    projectPath: '',
    airflowDagsPath: '',
    edgeAnimations: true,
    autoUpdate: true,
  },
});

let mainWindow: BrowserWindow | null = null;

// Cached update info so download/install can reference it
let pendingUpdate: { version: string; releaseNotes: string; downloadUrl: string; htmlUrl: string } | null = null;
let downloadedUpdatePath: string | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    title: 'Almanac',
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function sendProgress(step: string, detail: string) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('manifest-progress', { step, detail });
  }
}

function sendUpdateProgress(percent: number) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-progress', { percent });
  }
}

// Spawn a Python script — in dev mode, runs `python3 script.py`;
// in packaged mode, runs the compiled PyInstaller binary directly.
function spawnScript(scriptName: string, args: string[]) {
  const baseName = scriptName.replace(/\.py$/, '');
  if (app.isPackaged) {
    const binaryPath = path.join(process.resourcesPath, 'scripts', baseName);
    return spawn(binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  }
  const scriptPath = path.join(__dirname, '..', 'scripts', scriptName);
  return spawn('python3', [scriptPath, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
}

// ────────────────────────────────────────────────────
// Helper: Compare two semver strings (e.g. "1.2.3")
// Returns true if remote > local
// ────────────────────────────────────────────────────
function isNewerVersion(remote: string, local: string): boolean {
  const r = remote.replace(/^v/, '').split('.').map(Number);
  const l = local.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

// ────────────────────────────────────────────────────
// Helper: Fetch JSON from a URL (follows redirects)
// ────────────────────────────────────────────────────
function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Almanac-Updater' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        return fetchJson(res.headers.location!).then(resolve, reject);
      }
      if (res.statusCode === 404) {
        return resolve(null); // No releases yet
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

// ────────────────────────────────────────────────────
// Helper: Download a file with progress reporting
// Follows redirects (GitHub asset URLs redirect to S3)
// ────────────────────────────────────────────────────
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const makeRequest = (downloadUrl: string) => {
      const mod = downloadUrl.startsWith('https') ? https : require('http');
      const req = mod.get(downloadUrl, { headers: { 'User-Agent': 'Almanac-Updater' } }, (res: any) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          return makeRequest(res.headers.location!);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }
        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let receivedBytes = 0;
        const file = fs.createWriteStream(destPath);
        res.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (totalBytes > 0) {
            sendUpdateProgress(Math.round((receivedBytes / totalBytes) * 100));
          }
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', (err: Error) => { fs.unlink(destPath, () => {}); reject(err); });
      });
      req.on('error', reject);
      req.setTimeout(300000, () => { req.destroy(); reject(new Error('Download timed out')); });
    };
    makeRequest(url);
  });
}

// ────────────────────────────────────────────────────
// IPC Handlers
// ────────────────────────────────────────────────────

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select dbt Project Directory',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('read-manifest', async (_event, projectPath: string) => {
  const manifestPath = path.join(projectPath, 'target', 'manifest.json');

  return new Promise((resolve) => {
    sendProgress('reading', 'Starting manifest parser...');

    const proc = spawnScript('parse_manifest.py', [manifestPath]);

    const stdoutChunks: Buffer[] = [];
    let stderrBuffer = '';

    // stderr carries progress updates (one JSON per line)
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.step && msg.detail) {
            sendProgress(msg.step, msg.detail);
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    });

    // stdout carries the result JSON
    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false, error: `Python parser exited with code ${code}` });
        return;
      }

      try {
        sendProgress('transferring', 'Loading results...');
        const output = Buffer.concat(stdoutChunks).toString('utf-8');
        const data = JSON.parse(output);
        if (data.error) {
          resolve({ success: false, error: data.error });
        } else {
          resolve({ success: true, data });
        }
      } catch (err: any) {
        resolve({ success: false, error: `Failed to parse output: ${err.message}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: `Failed to start Python: ${err.message}. Make sure python3 is installed.` });
    });
  });
});

ipcMain.handle('scan-airflow-dags', async (_event, dagsPath: string, projectPath: string) => {
  const manifestPath = path.join(projectPath, 'target', 'manifest.json');

  return new Promise((resolve) => {
    const sendAirflowProgress = (step: string, detail: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('airflow-progress', { step, detail });
      }
    };

    sendAirflowProgress('scanning', 'Starting Airflow DAG scanner...');

    const proc = spawnScript('scan_airflow_dags.py', [dagsPath, manifestPath]);

    const stdoutChunks: Buffer[] = [];
    let stderrBuffer = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.step && msg.detail) {
            sendAirflowProgress(msg.step, msg.detail);
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    });

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false, error: `Airflow scanner exited with code ${code}` });
        return;
      }
      try {
        const output = Buffer.concat(stdoutChunks).toString('utf-8');
        const data = JSON.parse(output);
        if (data.error) {
          resolve({ success: false, error: data.error });
        } else {
          resolve({ success: true, data });
        }
      } catch (err: any) {
        resolve({ success: false, error: `Failed to parse scanner output: ${err.message}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: `Failed to start Python: ${err.message}` });
    });
  });
});

ipcMain.handle('get-settings', () => {
  return {
    projectPath: store.get('projectPath'),
    airflowDagsPath: store.get('airflowDagsPath'),
    edgeAnimations: store.get('edgeAnimations'),
    autoUpdate: store.get('autoUpdate'),
  };
});

ipcMain.handle('set-settings', (_event, settings: { projectPath?: string; airflowDagsPath?: string; edgeAnimations?: boolean; autoUpdate?: boolean }) => {
  if (settings.projectPath !== undefined) store.set('projectPath', settings.projectPath);
  if (settings.airflowDagsPath !== undefined) store.set('airflowDagsPath', settings.airflowDagsPath);
  if (settings.edgeAnimations !== undefined) store.set('edgeAnimations', settings.edgeAnimations);
  if (settings.autoUpdate !== undefined) store.set('autoUpdate', settings.autoUpdate);
  return true;
});

// ────────────────────────────────────────────────────
// Auto-Update IPC Handlers
// ────────────────────────────────────────────────────

ipcMain.handle('get-app-version', () => {
  return app.getVersion(); // reads from package.json "version"
});

ipcMain.handle('check-for-update', async () => {
  try {
    const release = await fetchJson(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
    );

    // No releases exist yet
    if (!release) {
      return { available: false };
    }

    const remoteVersion = (release.tag_name || '').replace(/^v/, '');
    const localVersion = app.getVersion();

    if (!remoteVersion || !isNewerVersion(remoteVersion, localVersion)) {
      return { available: false };
    }

    // Find the macOS .zip asset matching the current architecture (arm64 or x64)
    const arch = process.arch; // "arm64" on Apple Silicon, "x64" on Intel
    const zipAsset = (release.assets || []).find((a: any) =>
      a.name.endsWith('.zip') && a.name.includes(arch)
    );

    if (!zipAsset) {
      return { available: false, error: 'No macOS build found in the latest release.' };
    }

    const info = {
      version: remoteVersion,
      releaseNotes: release.body || '',
      downloadUrl: zipAsset.browser_download_url,
      htmlUrl: release.html_url,
    };

    pendingUpdate = info;
    return { available: true, info };
  } catch (err: any) {
    return { available: false, error: err.message };
  }
});

ipcMain.handle('download-update', async () => {
  if (!pendingUpdate) {
    return { success: false, error: 'No update available to download.' };
  }

  try {
    const updateDir = path.join(app.getPath('userData'), 'updates');
    fs.mkdirSync(updateDir, { recursive: true });

    const zipPath = path.join(updateDir, `Almanac-${pendingUpdate.version}.zip`);

    // Clean up any previous download
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    await downloadFile(pendingUpdate.downloadUrl, zipPath);
    downloadedUpdatePath = zipPath;

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// ────────────────────────────────────────────────────
// Custom Test Definitions IPC Handlers
// ────────────────────────────────────────────────────

const CUSTOM_TESTS_PATH = path.join(app.getPath('userData'), 'custom-tests.json');

const TESTS_TEMPLATE_YAML = `# custom-tests.yml
# Define human-readable descriptions for custom dbt tests
#
# Template syntax:
#   {{arg_name}}          - replaced with the test argument value
#   {{arg_name|default}}  - replaced with the argument value, or "default" if not provided
#   [[optional text]]     - only shown if all {{args}} inside it have values
#
# Examples:
#
#   - name: not_null_where
#     level: column
#     description: "Column should not be null[[ where {{where}}]]"
#
#   - name: row_count_threshold
#     level: table
#     description: "Table should have at least {{min_rows|1000}} rows"

tests: []
`;

interface CustomTestDef {
  name: string;
  level: 'column' | 'table';
  description: string;
}

ipcMain.handle('load-custom-tests', async () => {
  try {
    if (fs.existsSync(CUSTOM_TESTS_PATH)) {
      const data = fs.readFileSync(CUSTOM_TESTS_PATH, 'utf-8');
      return JSON.parse(data);
    }
    return [];
  } catch {
    return [];
  }
});

ipcMain.handle('save-custom-tests', async (_event, tests: CustomTestDef[]) => {
  try {
    fs.writeFileSync(CUSTOM_TESTS_PATH, JSON.stringify(tests, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('import-tests-yaml', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      title: 'Import Custom Test Definitions',
      filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Cancelled' };
    }
    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    const doc = yaml.load(content) as any;
    if (!doc || !Array.isArray(doc.tests)) {
      return { success: false, error: 'Invalid YAML format. Expected a "tests" array.' };
    }
    const tests: CustomTestDef[] = [];
    for (const entry of doc.tests) {
      if (!entry.name || !entry.level || !entry.description) {
        continue; // skip invalid entries
      }
      if (entry.level !== 'column' && entry.level !== 'table') {
        continue;
      }
      tests.push({
        name: String(entry.name),
        level: entry.level,
        description: String(entry.description),
      });
    }
    if (tests.length === 0) {
      return { success: false, error: 'No valid test definitions found in the file.' };
    }
    return { success: true, tests, count: tests.length };
  } catch (err: any) {
    return { success: false, error: `Failed to parse YAML: ${err.message}` };
  }
});

ipcMain.handle('export-tests-yaml', async (_event, tests: CustomTestDef[]) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export Custom Test Definitions',
      defaultPath: 'custom-tests.yml',
      filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }],
    });
    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Cancelled' };
    }
    const doc = { tests: tests.map((t) => ({ name: t.name, level: t.level, description: t.description })) };
    const yamlStr = yaml.dump(doc, { lineWidth: -1, quotingType: '"', forceQuotes: false });
    fs.writeFileSync(result.filePath, yamlStr, 'utf-8');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-tests-template', async () => {
  try {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Save Test Definitions Template',
      defaultPath: 'custom-tests-template.yml',
      filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }],
    });
    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Cancelled' };
    }
    fs.writeFileSync(result.filePath, TESTS_TEMPLATE_YAML, 'utf-8');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('install-update', async () => {
  if (!downloadedUpdatePath || !fs.existsSync(downloadedUpdatePath)) {
    return { success: false, error: 'No downloaded update found. Please download first.' };
  }

  const updateDir = path.join(app.getPath('userData'), 'updates');
  const extractDir = path.join(updateDir, 'extracted');

  try {
    // Clean up previous extraction
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });

    // Unzip the downloaded archive
    execSync(`unzip -o -q "${downloadedUpdatePath}" -d "${extractDir}"`);

    // Find the .app bundle in the extracted directory
    const findApp = (dir: string): string | null => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.endsWith('.app')) {
          return path.join(dir, entry.name);
        }
      }
      // Check one level deeper (some zips have a wrapper folder)
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const nested = findApp(path.join(dir, entry.name));
          if (nested) return nested;
        }
      }
      return null;
    };

    const newAppPath = findApp(extractDir);
    if (!newAppPath) {
      return { success: false, error: 'Could not find .app bundle in the downloaded update.' };
    }

    // Determine the current app location
    // In packaged mode: /Applications/Almanac.app/Contents/MacOS/Almanac
    // app.getAppPath() returns .../Contents/Resources/app.asar
    const currentAppPath = app.isPackaged
      ? path.resolve(app.getAppPath(), '..', '..', '..')
      : null;

    if (!currentAppPath || !currentAppPath.endsWith('.app')) {
      return {
        success: false,
        error: 'Cannot determine app install location. Please update manually.',
        needsManual: true,
        htmlUrl: pendingUpdate?.htmlUrl,
      };
    }

    // Step 1: Try xattr without sudo first
    try {
      execSync(`xattr -cr "${newAppPath}"`, { timeout: 10000 });
    } catch {
      // xattr without sudo failed, try with osascript (admin privileges)
      try {
        execSync(
          `osascript -e 'do shell script "xattr -cr \\"${newAppPath}\\"" with administrator privileges'`,
          { timeout: 30000 }
        );
      } catch (xattrErr: any) {
        // If user cancelled the password prompt or it failed, the app may still work
        // Continue anyway — the replace step will be the real test
        console.warn('xattr failed (may still work):', xattrErr.message);
      }
    }

    // Step 2: Try to replace the current .app bundle
    // First try without sudo
    try {
      execSync(`rm -rf "${currentAppPath}.bak"`, { timeout: 10000 });
      execSync(`mv "${currentAppPath}" "${currentAppPath}.bak"`, { timeout: 10000 });
      execSync(`mv "${newAppPath}" "${currentAppPath}"`, { timeout: 10000 });
      execSync(`rm -rf "${currentAppPath}.bak"`, { timeout: 10000 });
    } catch {
      // Without sudo failed — try with elevated privileges via osascript
      try {
        // Restore from backup if the mv partially succeeded
        if (fs.existsSync(`${currentAppPath}.bak`) && !fs.existsSync(currentAppPath)) {
          execSync(`mv "${currentAppPath}.bak" "${currentAppPath}"`, { timeout: 10000 });
        }

        const script = [
          `rm -rf "${currentAppPath}.bak"`,
          `mv "${currentAppPath}" "${currentAppPath}.bak"`,
          `mv "${newAppPath}" "${currentAppPath}"`,
          `rm -rf "${currentAppPath}.bak"`,
        ].join(' && ');

        execSync(
          `osascript -e 'do shell script "${script}" with administrator privileges'`,
          { timeout: 30000 }
        );
      } catch (moveErr: any) {
        // Restore from backup if possible
        try {
          if (fs.existsSync(`${currentAppPath}.bak`) && !fs.existsSync(currentAppPath)) {
            execSync(`mv "${currentAppPath}.bak" "${currentAppPath}"`);
          }
        } catch { /* best effort */ }

        // User probably cancelled the password dialog or it genuinely failed
        return {
          success: false,
          error: `Could not replace the app (${moveErr.message}). You can download the update manually.`,
          needsManual: true,
          htmlUrl: pendingUpdate?.htmlUrl,
        };
      }
    }

    // Clean up
    try {
      fs.rmSync(extractDir, { recursive: true, force: true });
      if (downloadedUpdatePath) fs.unlinkSync(downloadedUpdatePath);
    } catch { /* best effort */ }

    downloadedUpdatePath = null;

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      needsManual: true,
      htmlUrl: pendingUpdate?.htmlUrl,
    };
  }
});
