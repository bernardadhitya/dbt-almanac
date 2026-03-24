export interface ColumnInfo {
  name: string;
  type: string;
}

export interface SlimNode {
  unique_id: string;
  name: string;
  resource_type: string;
  schema: string;
  database?: string;
  description?: string;
  materialized?: string;
  tags?: string[];
  columns?: ColumnInfo[];
  raw_code?: string;
  // Source-specific fields
  source_description?: string;
  loader?: string;
  identifier?: string;
  source_name?: string;
  external_format?: string;
  external_uris?: string[];
  relation_name?: string;
}

/** The pre-processed data sent from main process (already slim) */
export interface PreProcessedManifest {
  models: Record<string, SlimNode>;
  sources: Record<string, SlimNode>;
  parentMap: Record<string, string[]>;
  childMap: Record<string, string[]>;
  modelNames: string[];
}

export interface ParsedManifest {
  models: Map<string, SlimNode>;
  sources: Map<string, SlimNode>;
  allNodes: Map<string, SlimNode>;
  parentMap: Map<string, string[]>;
  childMap: Map<string, string[]>;
  modelNames: string[];
}

export interface FilterState {
  selectedModel: string | null;
  upstreamLevel: number;   // 1–5
  downstreamLevel: number; // 1–5
  locked: boolean;         // sync both handles
}

export interface Settings {
  projectPath: string;
  airflowDagsPath: string;
  edgeAnimations: boolean;
  autoUpdate: boolean;
}

export interface UpdateInfo {
  version: string;
  releaseNotes: string;
  downloadUrl: string;
  htmlUrl: string;
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date'; currentVersion: string }
  | { state: 'available'; info: UpdateInfo }
  | { state: 'downloading'; progress: number }
  | { state: 'ready'; info: UpdateInfo }
  | { state: 'error'; message: string; htmlUrl?: string };

export interface AirflowSchedule {
  type: 'cron' | 'preset' | 'timedelta' | 'dataset' | 'none' | 'unknown';
  display: string;
  datasets?: string[];
}

export interface AirflowDagInfo {
  dagFile: string;
  selector: string;
  schedule?: AirflowSchedule;
}

/** Mapping from model unique_id to list of Airflow DAGs that invoke it */
export type AirflowDagMap = Record<string, AirflowDagInfo[]>;

export interface LoadingProgress {
  step: string;
  detail: string;
}

declare global {
  interface Window {
    electronAPI: {
      selectDirectory: () => Promise<string | null>;
      readManifest: (projectPath: string) => Promise<{ success: boolean; data?: PreProcessedManifest; error?: string }>;
      scanAirflowDags: (dagsPath: string, projectPath: string) => Promise<{ success: boolean; data?: AirflowDagMap; error?: string }>;
      getSettings: () => Promise<Settings>;
      setSettings: (settings: Partial<Settings>) => Promise<boolean>;
      onManifestProgress: (callback: (data: LoadingProgress) => void) => () => void;
      onAirflowProgress: (callback: (data: LoadingProgress) => void) => () => void;
      getAppVersion: () => Promise<string>;
      checkForUpdate: () => Promise<{ available: boolean; info?: UpdateInfo; error?: string }>;
      downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
      installUpdate: () => Promise<{ success: boolean; error?: string; needsManual?: boolean; htmlUrl?: string }>;
      onUpdateProgress: (callback: (data: { percent: number }) => void) => () => void;
    };
  }
}
