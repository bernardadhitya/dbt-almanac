import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { spawn } from 'child_process';
import Store from 'electron-store';

const store = new Store({
  defaults: {
    projectPath: '',
    theme: 'light' as 'light' | 'dark',
  },
});

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
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

// Resolve the Python script path (works in both dev and packaged)
function getParserScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'scripts', 'parse_manifest.py');
  }
  return path.join(__dirname, '..', 'scripts', 'parse_manifest.py');
}

// IPC Handlers
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
  const scriptPath = getParserScriptPath();

  return new Promise((resolve) => {
    sendProgress('reading', 'Starting Python parser...');

    const proc = spawn('python3', [scriptPath, manifestPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

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

ipcMain.handle('get-settings', () => {
  return {
    projectPath: store.get('projectPath'),
    theme: store.get('theme'),
  };
});

ipcMain.handle('set-settings', (_event, settings: { projectPath?: string; theme?: string }) => {
  if (settings.projectPath !== undefined) store.set('projectPath', settings.projectPath);
  if (settings.theme !== undefined) store.set('theme', settings.theme);
  return true;
});
