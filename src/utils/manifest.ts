import { PreProcessedManifest, SlimNode, ParsedManifest } from '../types';

/** Convert plain objects from IPC into Maps for fast lookup */
export function hydrateManifest(data: PreProcessedManifest): ParsedManifest {
  const models = new Map<string, SlimNode>(Object.entries(data.models));
  const sources = new Map<string, SlimNode>(Object.entries(data.sources));
  const allNodes = new Map<string, SlimNode>([...models, ...sources]);
  const parentMap = new Map<string, string[]>(Object.entries(data.parentMap));
  const childMap = new Map<string, string[]>(Object.entries(data.childMap));

  return { models, sources, allNodes, parentMap, childMap, modelNames: data.modelNames };
}
