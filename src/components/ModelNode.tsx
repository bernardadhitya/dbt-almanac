import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

interface ModelNodeData {
  label: string;
  resourceType: string;
  schema: string;
  isSelected: boolean;
  isSource: boolean;
  isHighlighted: boolean;
  [key: string]: unknown;
}

function ModelNodeComponent({ data }: NodeProps) {
  const { label, resourceType, schema, isSelected, isSource, isHighlighted } = data as unknown as ModelNodeData;

  let bgClass = 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600';
  if (isHighlighted) {
    bgClass = 'bg-amber-100 dark:bg-amber-900/50 border-amber-500 dark:border-amber-400 ring-2 ring-amber-400/50 dark:ring-amber-500/40';
  } else if (isSelected) {
    bgClass = 'bg-blue-100 dark:bg-blue-900 border-blue-500 dark:border-blue-400';
  } else if (isSource) {
    bgClass = 'bg-green-50 dark:bg-green-900/40 border-green-400 dark:border-green-600';
  }

  return (
    <div
      className={`px-3 py-2 rounded-lg border-2 shadow-sm whitespace-nowrap ${bgClass}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400 dark:!bg-gray-500" />
      <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">
        {label}
      </div>
      <div className="text-[10px] text-gray-500 dark:text-gray-400">
        {isSource ? 'source' : resourceType}
        {schema ? ` · ${schema}` : ''}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-gray-400 dark:!bg-gray-500" />
    </div>
  );
}

export const ModelNode = memo(ModelNodeComponent);
