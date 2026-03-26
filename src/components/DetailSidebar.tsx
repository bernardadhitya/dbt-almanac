import { useState, useEffect, useCallback, useRef } from 'react';
import { SlimNode, AirflowDagInfo } from '../types';
import { DbtIcon, AirflowIcon } from './Icons';
import { CopyButton } from './CopyButton';

const MIN_WIDTH = 240;
const DEFAULT_WIDTH = 320;

interface DetailSidebarProps {
  node: SlimNode;
  airflowDags?: AirflowDagInfo[] | null;
  onClose: () => void;
}

/** Infer the source system from external format, loader, source_name, or schema */
function inferSourceSystem(node: SlimNode): string | null {
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

  if (node.loader) {
    if (node.loader === 'external_table') return 'External Table';
    return node.loader;
  }

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

function ExternalLinkIcon() {
  return (
    <svg className="w-3 h-3 inline ml-0.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

export function DetailSidebar({ node, airflowDags, onClose }: DetailSidebarProps) {
  const isSource = node.resource_type === 'source';
  const columns = node.columns || [];
  const [columnsExpanded, setColumnsExpanded] = useState(false);
  const MAX_COLUMNS = 20;
  const hasMoreCols = columns.length > MAX_COLUMNS;
  const visibleCols = columnsExpanded ? columns : columns.slice(0, MAX_COLUMNS);
  const description = node.description || node.source_description || '';

  const sourceSystem = isSource ? inferSourceSystem(node) : null;
  const externalUris = node.external_uris || [];

  // Resizable width
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);

  const maxWidth = useCallback(() => Math.floor(window.innerWidth / 2), []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      // Right sidebar: width = viewport width - cursor X
      const newWidth = Math.max(MIN_WIDTH, Math.min(window.innerWidth - e.clientX, maxWidth()));
      setWidth(newWidth);
    };
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [maxWidth]);

  return (
    <div
      className="h-full flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-lg animate-slide-in-right relative"
      style={{ width }}
    >
      {/* Resize handle (left edge) */}
      <div
        onMouseDown={onMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors z-10"
      />

      {/* Header */}
      <div className={`px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0 ${
        isSource
          ? 'bg-green-50 dark:bg-green-900/30'
          : 'bg-blue-50 dark:bg-blue-900/30'
      }`}>
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 leading-snug flex items-start gap-2 min-w-0">
            {!isSource && <DbtIcon className="w-4 h-4 mt-0.5 shrink-0" />}
            <span className="min-w-0">
              <span className="break-all">{node.name}</span>
              <span className="inline-flex align-middle ml-1.5">
                <CopyButton text={node.name} label={isSource ? 'Source name' : 'Model name'} />
              </span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors"
            title="Close details"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
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
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
        {/* Description */}
        {description && (
          <section>
            <h3 className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
              Description
            </h3>
            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
              {description}
            </p>
          </section>
        )}

        {/* Source URIs */}
        {externalUris.length > 0 && (
          <section>
            <h3 className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
              Source URI
            </h3>
            {externalUris.map((uri, i) => (
              <a
                key={i}
                href={uri}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
                title={uri}
              >
                {uri}
                <ExternalLinkIcon />
              </a>
            ))}
          </section>
        )}

        {/* Database / Schema / Identifier */}
        <section>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {node.database && (
              <div className="min-w-0">
                <h3 className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Database</h3>
                <div className="text-xs text-gray-700 dark:text-gray-300 truncate">{node.database}</div>
              </div>
            )}
            {node.schema && (
              <div className="min-w-0">
                <h3 className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Schema</h3>
                <div className="text-xs text-gray-700 dark:text-gray-300 truncate">{node.schema}</div>
              </div>
            )}
            {isSource && node.identifier && node.identifier !== node.name && (
              <div className="min-w-0">
                <h3 className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Identifier</h3>
                <div className="text-xs text-gray-700 dark:text-gray-300 truncate">{node.identifier}</div>
              </div>
            )}
          </div>
        </section>

        {/* Tags */}
        {node.tags && node.tags.length > 0 && (
          <section>
            <h3 className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
              Tags
            </h3>
            <div className="flex flex-wrap gap-1">
              {node.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-[11px]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Airflow DAGs */}
        {airflowDags && airflowDags.length > 0 && (
          <section>
            <h3 className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
              Airflow DAGs ({airflowDags.length})
            </h3>
            <div className="space-y-2">
              {airflowDags.map((dag, i) => (
                <div
                  key={`${dag.dagFile}-${i}`}
                  className="flex items-start gap-2 text-xs"
                >
                  <AirflowIcon className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-800 dark:text-gray-200">
                      <span className="break-all">{dag.dagFile.replace(/\.py$/, '')}</span>
                      <span className="inline-flex align-middle ml-1.5">
                        <CopyButton text={dag.dagFile.replace(/\.py$/, '')} label="DAG name" />
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 font-mono break-all mt-0.5">
                      {dag.selector}
                    </div>
                    {dag.schedule && (
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {dag.schedule.display}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Columns */}
        <section>
          <h3 className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
            Columns ({columns.length})
          </h3>
          {columns.length > 0 ? (
            <div className="border border-gray-100 dark:border-gray-700 rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/60">
                    <th className="text-left px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">Name</th>
                    <th className="text-left px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">Type</th>
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
                      <td className="px-2 py-1 text-gray-800 dark:text-gray-200 font-mono truncate max-w-[160px]">
                        {col.name}
                      </td>
                      <td className="px-2 py-1 text-gray-500 dark:text-gray-400 font-mono truncate max-w-[100px]">
                        {col.type || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hasMoreCols && (
                <button
                  onClick={() => setColumnsExpanded(!columnsExpanded)}
                  className="w-full px-2 py-1.5 text-center text-[11px] text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/40 transition-colors cursor-pointer"
                >
                  {columnsExpanded
                    ? 'Show less'
                    : `+${columns.length - MAX_COLUMNS} more columns`
                  }
                </button>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">
              No column definitions available
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
