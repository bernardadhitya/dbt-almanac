import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  readManifest: (projectPath: string) => ipcRenderer.invoke('read-manifest', projectPath),
  scanAirflowDags: (dagsPath: string, projectPath: string) =>
    ipcRenderer.invoke('scan-airflow-dags', dagsPath, projectPath),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (settings: { projectPath?: string; airflowDagsPath?: string; edgeAnimations?: boolean; autoUpdate?: boolean }) =>
    ipcRenderer.invoke('set-settings', settings),
  onManifestProgress: (callback: (data: { step: string; detail: string }) => void) => {
    const handler = (_event: any, data: { step: string; detail: string }) => callback(data);
    ipcRenderer.on('manifest-progress', handler);
    return () => ipcRenderer.removeListener('manifest-progress', handler);
  },
  onAirflowProgress: (callback: (data: { step: string; detail: string }) => void) => {
    const handler = (_event: any, data: { step: string; detail: string }) => callback(data);
    ipcRenderer.on('airflow-progress', handler);
    return () => ipcRenderer.removeListener('airflow-progress', handler);
  },
  // Update-related APIs
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  relaunchApp: () => ipcRenderer.invoke('relaunch-app'),
  onUpdateProgress: (callback: (data: { percent: number }) => void) => {
    const handler = (_event: any, data: { percent: number }) => callback(data);
    ipcRenderer.on('update-progress', handler);
    return () => ipcRenderer.removeListener('update-progress', handler);
  },
  // Custom test definitions
  loadCustomTests: () => ipcRenderer.invoke('load-custom-tests'),
  saveCustomTests: (tests: any[]) => ipcRenderer.invoke('save-custom-tests', tests),
  importTestsYaml: () => ipcRenderer.invoke('import-tests-yaml'),
  exportTestsYaml: (tests: any[]) => ipcRenderer.invoke('export-tests-yaml', tests),
  saveTestsTemplate: () => ipcRenderer.invoke('save-tests-template'),
});
