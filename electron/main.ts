import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { spawn } from 'child_process';
import Store from 'electron-store';

const store = new Store({
  defaults: {
    projectPath: '',
    airflowDagsPath: '',
    theme: 'light' as 'light' | 'dark',
    edgeAnimations: true,
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

// Resolve Python script paths (works in both dev and packaged)
function getScriptPath(scriptName: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'scripts', scriptName);
  }
  return path.join(__dirname, '..', 'scripts', scriptName);
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
  const scriptPath = getScriptPath('parse_manifest.py');

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

ipcMain.handle('scan-airflow-dags', async (_event, dagsPath: string, projectPath: string) => {
  const manifestPath = path.join(projectPath, 'target', 'manifest.json');
  const scriptPath = getScriptPath('scan_airflow_dags.py');

  return new Promise((resolve) => {
    const sendAirflowProgress = (step: string, detail: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('airflow-progress', { step, detail });
      }
    };

    sendAirflowProgress('scanning', 'Starting Airflow DAG scanner...');

    const proc = spawn('python3', [scriptPath, dagsPath, manifestPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

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
    theme: store.get('theme'),
    edgeAnimations: store.get('edgeAnimations'),
  };
});

ipcMain.handle('set-settings', (_event, settings: { projectPath?: string; airflowDagsPath?: string; theme?: string; edgeAnimations?: boolean }) => {
  if (settings.projectPath !== undefined) store.set('projectPath', settings.projectPath);
  if (settings.airflowDagsPath !== undefined) store.set('airflowDagsPath', settings.airflowDagsPath);
  if (settings.theme !== undefined) store.set('theme', settings.theme);
  if (settings.edgeAnimations !== undefined) store.set('edgeAnimations', settings.edgeAnimations);
  return true;
});
