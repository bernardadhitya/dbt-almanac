/**
 * Human-readable description templates for known dbt tests.
 *
 * Built-in templates are loaded from src/data/builtin-tests.yml at build time.
 * The YAML format is identical to the custom tests YAML that users can upload,
 * making it easy for developers to reference as an example.
 *
 * Template syntax:
 *   {{var}}         — replaced with the kwarg value
 *   {{var|default}} — replaced with the kwarg value, or "default" if not provided
 *   [[...{{var}}...]] — optional segment, shown only if {{var}} has a value
 *
 * For tests that exist at both column and table level, append ":column" or ":table"
 * to the name (e.g. "dbt_utils.expression_is_true:table").
 */

import { load as yamlLoad } from 'js-yaml';
import builtinTestsYaml from '../data/builtin-tests.yml?raw';

interface TestTemplate {
  template: string;
  level: 'column' | 'table';
}

// Parse the built-in YAML at module load time and build the lookup map
function loadBuiltinTemplates(): Record<string, TestTemplate> {
  const map: Record<string, TestTemplate> = {};
  try {
    const doc = yamlLoad(builtinTestsYaml) as { tests?: { name: string; level: string; description: string }[] };
    if (doc?.tests) {
      for (const entry of doc.tests) {
        if (entry.name && entry.level && entry.description) {
          map[entry.name] = {
            template: entry.description,
            level: entry.level as 'column' | 'table',
          };
        }
      }
    }
  } catch (e) {
    console.error('Failed to load built-in test descriptions:', e);
  }
  return map;
}

const TEST_TEMPLATES: Record<string, TestTemplate> = loadBuiltinTemplates();

/**
 * Format a value for display in a test description.
 * Arrays are joined with commas, objects are JSON-stringified, etc.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Check if a kwarg value is "present" (non-null, non-empty).
 */
function hasValue(kwargs: Record<string, unknown>, key: string): boolean {
  const v = kwargs[key];
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

/**
 * Resolve a {{var|default}} reference: returns the kwarg value if present,
 * falls back to the default if provided, or null if neither exists.
 */
function resolveVar(kwargs: Record<string, unknown>, key: string, defaultVal?: string): string | null {
  if (hasValue(kwargs, key)) return formatValue(kwargs[key]);
  if (defaultVal !== undefined) return defaultVal;
  return null;
}

// Regex that matches {{var}} or {{var|default}}
const VAR_REGEX = /\{\{(\w+)(?:\|([^}]*))?\}\}/g;

/**
 * Render a test description template with kwargs.
 *
 * Syntax:
 *   {{var}}         — replaced with kwarg value; if missing, the key name is shown as fallback
 *   {{var|default}} — replaced with kwarg value; if missing, uses the default value
 *   [[...]]        — optional segment; dropped entirely if any {{var}} inside has no value and no default
 */
function renderTemplate(template: string, kwargs: Record<string, unknown>): string {
  // Step 1: Process [[ ... ]] optional segments (can be nested, process inner first)
  let result = template;
  const optionalRegex = /\[\[([^\[\]]*?)\]\]/g;
  let prevResult = '';
  while (prevResult !== result) {
    prevResult = result;
    result = result.replace(optionalRegex, (_match, inner: string) => {
      // Find all {{var}} or {{var|default}} references in this segment
      const varRefs = [...inner.matchAll(VAR_REGEX)];
      // If any referenced var is missing AND has no default, drop the entire segment
      for (const ref of varRefs) {
        const key = ref[1];
        const defaultVal = ref[2]; // undefined if no | was present
        if (!hasValue(kwargs, key) && defaultVal === undefined) return '';
      }
      // All vars resolvable — keep the segment (vars will be replaced in step 2)
      return inner;
    });
  }

  // Step 2: Replace {{var}} and {{var|default}} with resolved values
  result = result.replace(VAR_REGEX, (_match, key: string, defaultVal?: string) => {
    const resolved = resolveVar(kwargs, key, defaultVal);
    return resolved !== null ? resolved : key;
  });

  // Clean up any double spaces from removed optional segments
  result = result.replace(/  +/g, ' ').trim();

  return result;
}

/** A segment of a rendered test description — either plain text or a resolved argument value. */
export interface DescriptionSegment {
  type: 'text' | 'arg';
  value: string;
}

/**
 * Render a template into structured segments, marking argument values distinctly.
 */
function renderTemplateSegments(template: string, kwargs: Record<string, unknown>): DescriptionSegment[] {
  // Step 1: Process [[ ... ]] optional segments (same as renderTemplate)
  let result = template;
  const optionalRegex = /\[\[([^\[\]]*?)\]\]/g;
  let prevResult = '';
  while (prevResult !== result) {
    prevResult = result;
    result = result.replace(optionalRegex, (_match, inner: string) => {
      const varRefs = [...inner.matchAll(VAR_REGEX)];
      for (const ref of varRefs) {
        const key = ref[1];
        const defaultVal = ref[2];
        if (!hasValue(kwargs, key) && defaultVal === undefined) return '';
      }
      return inner;
    });
  }

  // Clean up double spaces
  result = result.replace(/  +/g, ' ').trim();

  // Step 2: Split into segments, alternating between text and resolved args
  const segments: DescriptionSegment[] = [];
  let lastIndex = 0;
  const regex = /\{\{(\w+)(?:\|([^}]*))?\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(result)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: result.slice(lastIndex, match.index) });
    }
    const key = match[1];
    const defaultVal = match[2];
    const resolved = resolveVar(kwargs, key, defaultVal);
    segments.push({ type: 'arg', value: resolved !== null ? resolved : key });
    lastIndex = match.index + match[0].length;
  }

  // Trailing text
  if (lastIndex < result.length) {
    segments.push({ type: 'text', value: result.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: result }];
}

// ── Custom test overlay ──
// Custom definitions are merged at runtime, overriding built-in templates.
let customOverrides: Record<string, TestTemplate> = {};

/**
 * Merge an array of custom test definitions (from YAML import / settings)
 * into the lookup table. Custom definitions take priority over built-in ones.
 */
export function setCustomTestDefinitions(
  customs: { name: string; level: 'column' | 'table'; description: string }[],
): void {
  const map: Record<string, TestTemplate> = {};
  for (const c of customs) {
    map[c.name] = { template: c.description, level: c.level };
  }
  customOverrides = map;
}

/**
 * Get a human-readable description for a test.
 *
 * @param testName - Full test name (e.g. "not_null", "dbt_expectations.expect_column_values_to_be_between")
 * @param kwargs - Test arguments from manifest.json
 * @param level - Whether this is a "column" or "table" level test context
 * @returns { description, isKnown } — the rendered description and whether a template was found
 */
export function getTestDescription(
  testName: string,
  kwargs: Record<string, unknown>,
  level: 'column' | 'table',
): { description: string; segments: DescriptionSegment[]; isKnown: boolean } {
  // Try level-specific key first (for tests that exist at both levels like expression_is_true)
  const levelKey = `${testName}:${level}`;

  // Custom overrides take priority
  const customEntry = customOverrides[levelKey] || customOverrides[testName];
  if (customEntry) {
    return {
      description: renderTemplate(customEntry.template, kwargs),
      segments: renderTemplateSegments(customEntry.template, kwargs),
      isKnown: true,
    };
  }

  // Then built-in templates
  const entry = TEST_TEMPLATES[levelKey] || TEST_TEMPLATES[testName];
  if (entry) {
    return {
      description: renderTemplate(entry.template, kwargs),
      segments: renderTemplateSegments(entry.template, kwargs),
      isKnown: true,
    };
  }

  // Unknown/custom test — return name as-is
  return {
    description: testName,
    segments: [{ type: 'text', value: testName }],
    isKnown: false,
  };
}
