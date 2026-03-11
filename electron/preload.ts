import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  readManifest: (projectPath: string) => ipcRenderer.invoke('read-manifest', projectPath),
  scanAirflowDags: (dagsPath: string, projectPath: string) =>
    ipcRenderer.invoke('scan-airflow-dags', dagsPath, projectPath),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (settings: { projectPath?: string; airflowDagsPath?: string; theme?: string }) =>
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
});
