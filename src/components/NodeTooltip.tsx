import { useRef, useLayoutEffect, useState } from 'react';
import { SlimNode, AirflowDagInfo } from '../types';
import { DbtIcon, AirflowIcon } from './Icons';
import { CopyButton } from './CopyButton';

interface NodeTooltipProps {
  node: SlimNode;
  x: number;
  y: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  airflowDags?: AirflowDagInfo[] | null;
  /** Reports whether the tooltip rendered above or below the anchor point */
  onPlacementResolved?: (placement: 'above' | 'below') => void;
}

const MAX_COLUMNS = 12;
const OFFSET = 48;

/** Infer the source system from external format, loader, source_name, or schema */
function inferSourceSystem(node: SlimNode): string | null {
  // 1. External format is definitive
  if (node.external_format) {
    const fmt = node.external_format.toUpperCase();
    const formatMap: Record<string, string> = {
      'GOOGLE_SHEETS': 'Google Sheets',
      'CSV': 'CSV',
      'PARQUET': 'Parquet',
      'AVRO': 'Avro',
      'ORC': 'ORC',
      'JSON': 'JSON',
      'NEWLINE_DELIMITED_JSON': 'NDJSON',
      'ICEBERG': 'Iceberg',
    };
    return formatMap[fmt] || fmt;
  }

  // 2. Loader field
  if (node.loader) {
    if (node.loader === 'external_table') return 'External Table';
    return node.loader;
  }

  // 3. Pattern-match on source_name or schema
  const hint = (node.source_name || node.schema || '').toLowerCase();
  if (!hint) return null;

  const patterns: [RegExp, string][] = [
    [/mongo/,             'MongoDB'],
    [/mysql/,             'MySQL'],
    [/mssql|sqlserver/,   'SQL Server'],
    [/postgres|postgresql/,'PostgreSQL'],
    [/kafka/,             'Kafka'],
    [/braze/,             'Braze'],
    [/mixpanel/,          'Mixpanel'],
    [/google_analytics/,  'Google Analytics'],
    [/google_play/,       'Google Play'],
    [/google_sheets?/,    'Google Sheets'],
    [/firebase/,          'Firebase'],
    [/salesforce/,        'Salesforce'],
    [/hubspot/,           'HubSpot'],
    [/stripe/,            'Stripe'],
    [/snowflake/,         'Snowflake'],
    [/redshift/,          'Redshift'],
    [/dynamodb/,          'DynamoDB'],
    [/s3/,                'S3'],
    [/gcs/,               'GCS'],
    [/cdc/,               'CDC'],
  ];

  for (const [regex, label] of patterns) {
    if (regex.test(hint)) return label;
  }

  return null;
}

// Icon for external link
function ExternalLinkIcon() {
  return (
    <svg className="w-2.5 h-2.5 inline ml-0.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

export function NodeTooltip({ node, x, y, onMouseEnter, onMouseLeave, airflowDags, onPlacementResolved }: NodeTooltipProps) {
  const isSource = node.resource_type === 'source';
  const columns = node.columns || [];
  const [columnsExpanded, setColumnsExpanded] = useState(false);
  const hasMoreCols = columns.length > MAX_COLUMNS;
  const visibleCols = columnsExpanded ? columns : columns.slice(0, MAX_COLUMNS);
  const description = node.description || node.source_description || '';

  const sourceSystem = isSource ? inferSourceSystem(node) : null;
  const externalUris = node.external_uris || [];

  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y - OFFSET });

  // Default: centered horizontally on cursor, above the cursor.
  // Falls back to below cursor or shifted left/right if near viewport edges.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: center on cursor
    let left = x - rect.width / 2;
    if (left + rect.width > vw - 8) left = vw - rect.width - 8;
    if (left < 8) left = 8;

    // Vertical: above cursor by default
    let top = y - rect.height - OFFSET;
    let placement: 'above' | 'below' = 'above';
    if (top < 8) {
      top = y + OFFSET; // flip below if no room above
      placement = 'below';
    }
    if (top + rect.height > vh - 8) top = vh - rect.height - 8;

    setPos({ left, top });
    onPlacementResolved?.(placement);
  }, [x, y, onPlacementResolved]);

  return (
    <div
      ref={ref}
      className="fixed z-[100]"
      style={{ left: pos.left, top: pos.top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden text-xs flex flex-col"
        style={{ maxHeight: '400px' }}
      >
        {/* Header */}
        <div className={`px-3 py-2 border-b border-gray-100 dark:border-gray-700 shrink-0 ${
          isSource
            ? 'bg-green-50 dark:bg-green-900/30'
            : 'bg-blue-50 dark:bg-blue-900/30'
        }`}>
          <div className="font-semibold text-gray-900 dark:text-gray-100 leading-snug flex items-start gap-1.5">
            {!isSource && <DbtIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
            <span className="min-w-0">
              <span className="break-all">{node.name}</span>
              <span className="inline-flex align-middle ml-1"><CopyButton text={node.name} label={isSource ? 'Source name' : 'Model name'} /></span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
              isSource
                ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300'
                : 'bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300'
            }`}>
              {isSource ? 'source' : 'model'}
            </span>
            {node.materialized && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300">
                {node.materialized}
              </span>
            )}
            {sourceSystem && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-100 dark:bg-teal-800/50 text-teal-700 dark:text-teal-300">
                {sourceSystem}
              </span>
            )}
            {node.loader && !sourceSystem?.includes(node.loader) && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300">
                {node.loader}
              </span>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="px-3 py-2 space-y-2 overflow-y-auto min-h-0">
          {/* Description */}
          {description && (
            <div>
              <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">
                Description
              </div>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-3">
                {description}
              </p>
            </div>
          )}

          {/* Source URIs (external sources like Google Sheets) */}
          {externalUris.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">
                Source URI
              </div>
              {externalUris.map((uri, i) => (
                <a
                  key={i}
                  href={uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-blue-600 dark:text-blue-400 hover:underline truncate"
                  title={uri}
                >
                  {uri}
                  <ExternalLinkIcon />
                </a>
              ))}
            </div>
          )}

          {/* Database / Schema */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {node.database && (
              <div className="min-w-0">
                <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Database</span>
                <div className="text-gray-700 dark:text-gray-300 truncate">{node.database}</div>
              </div>
            )}
            {node.schema && (
              <div className="min-w-0">
                <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Schema</span>
                <div className="text-gray-700 dark:text-gray-300 truncate">{node.schema}</div>
              </div>
            )}
            {isSource && node.identifier && node.identifier !== node.name && (
              <div className="min-w-0">
                <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Identifier</span>
                <div className="text-gray-700 dark:text-gray-300 truncate">{node.identifier}</div>
              </div>
            )}
          </div>

          {/* Tags */}
          {node.tags && node.tags.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">
                Tags
              </div>
              <div className="flex flex-wrap gap-1">
                {node.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-[10px]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Airflow DAGs */}
          {airflowDags && airflowDags.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">
                Airflow DAGs ({airflowDags.length})
              </div>
              <div className="space-y-1">
                {airflowDags.map((dag, i) => (
                  <div
                    key={`${dag.dagFile}-${i}`}
                    className="flex items-start gap-1.5 text-[11px]"
                  >
                    <AirflowIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-800 dark:text-gray-200">
                        <span className="break-all">{dag.dagFile.replace(/\.py$/, '')}</span>
                        <span className="inline-flex align-middle ml-1"><CopyButton text={dag.dagFile.replace(/\.py$/, '')} label="DAG name" /></span>
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono break-all">
                        {dag.selector}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Columns */}
          {columns.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                Columns ({columns.length})
              </div>
              <div className="border border-gray-100 dark:border-gray-700 rounded overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/60">
                      <th className="text-left px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">Name</th>
                      <th className="text-left px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCols.map((col, i) => (
                      <tr
                        key={col.name}
                        className={i % 2 === 0
                          ? 'bg-white dark:bg-gray-900/20'
                          : 'bg-gray-50/50 dark:bg-gray-800/30'
                        }
                      >
                        <td className="px-2 py-0.5 text-gray-800 dark:text-gray-200 font-mono truncate max-w-[140px]">
                          {col.name}
                        </td>
                        <td className="px-2 py-0.5 text-gray-500 dark:text-gray-400 font-mono truncate max-w-[80px]" title={col.type || undefined}>
                          {col.type || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {hasMoreCols && (
                  <button
                    onClick={() => setColumnsExpanded(!columnsExpanded)}
                    className="w-full px-2 py-1 text-center text-[10px] text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/40 transition-colors cursor-pointer"
                  >
                    {columnsExpanded
                      ? 'Show less'
                      : `+${columns.length - MAX_COLUMNS} more columns`
                    }
                  </button>
                )}
              </div>
            </div>
          )}

          {/* No columns */}
          {columns.length === 0 && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 italic">
              No column definitions available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
