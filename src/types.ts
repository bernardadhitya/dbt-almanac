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
  upstream: boolean;
  downstream: boolean;
  level: number;
}

export interface Settings {
  projectPath: string;
  theme: 'light' | 'dark';
}

export interface LoadingProgress {
  step: string;
  detail: string;
}

declare global {
  interface Window {
    electronAPI: {
      selectDirectory: () => Promise<string | null>;
      readManifest: (projectPath: string) => Promise<{ success: boolean; data?: PreProcessedManifest; error?: string }>;
      getSettings: () => Promise<Settings>;
      setSettings: (settings: Partial<Settings>) => Promise<boolean>;
      onManifestProgress: (callback: (data: LoadingProgress) => void) => () => void;
    };
  }
}
