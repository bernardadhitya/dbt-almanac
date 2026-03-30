/**
 * Human-readable description templates for known dbt tests.
 *
 * Template syntax:
 *   {{var}}         — replaced with the kwarg value
 *   [[...{{var}}...]] — optional segment, shown only if {{var}} has a value
 *
 * For column-level tests the template starts with "Column ..."
 * For table-level tests the template starts with "Table ..."
 * Some tests appear at both levels with different templates (keyed by "test_name:column" / "test_name:table").
 */

interface TestTemplate {
  template: string;
  level: 'column' | 'table';
}

// Map of "test_name" or "test_name:level" → template
// When a test exists at both column and table level, we store both with the :level suffix
const TEST_TEMPLATES: Record<string, TestTemplate> = {
  // ── default ──
  'not_null': { template: 'Column should not contain any NULL values', level: 'column' },
  'unique': { template: 'Column should not contain any duplicate values', level: 'column' },
  'accepted_values': { template: 'Column should only contain values from {{values}}', level: 'column' },
  'relationships': { template: 'Column should only have values that exist in {{field}} of {{to}}', level: 'column' },

  // ── dbt_utils ──
  'dbt_utils.equal_rowcount': { template: 'Table should have the same number of rows as {{compare_model}}', level: 'table' },
  'dbt_utils.fewer_rows_than': { template: 'Table should have fewer rows than {{compare_model}}', level: 'table' },
  'dbt_utils.equality': { template: 'Table should have identical content to {{compare_model}}[[, optionally comparing only {{compare_columns}}]][[, or excluding {{exclude_columns}}]][[, with {{precision}} decimal precision]]', level: 'table' },
  'dbt_utils.expression_is_true:table': { template: 'Table should return true for all rows for expression {{expression}}', level: 'table' },
  'dbt_utils.expression_is_true:column': { template: 'Column should return true for all rows for expression {{expression}}', level: 'column' },
  'dbt_utils.recency': { template: 'Table should have its most recent value in {{field}} within {{interval}} {{datepart}}(s) from now', level: 'table' },
  'dbt_utils.at_least_one': { template: 'Column should contain at least one non-null value', level: 'column' },
  'dbt_utils.not_constant': { template: 'Column should not have the same value in every row', level: 'column' },
  'dbt_utils.not_empty_string': { template: 'Column should not contain any empty string values[[ (whitespace trimming: {{trim_whitespace}})]]', level: 'column' },
  'dbt_utils.cardinality_equality': { template: 'Column should have the same number of distinct values as {{field}} in {{to}}', level: 'column' },
  'dbt_utils.not_null_proportion': { template: 'Column should have a non-null proportion of at least {{at_least}}[[ and at most {{at_most}}]]', level: 'column' },
  'dbt_utils.not_accepted_values': { template: 'Column should never contain any of {{values}}', level: 'column' },
  'dbt_utils.relationships_where': { template: 'Column should only have values that exist in {{field}} of {{to}}[[, filtering source rows by {{from_condition}}]][[, and target rows by {{to_condition}}]]', level: 'column' },
  'dbt_utils.mutually_exclusive_ranges': { template: 'Table should have no overlapping ranges from {{lower_bound_column}} to {{upper_bound_column}}[[, partitioned by {{partition_by}}]][[, with gaps policy {{gaps}}]]', level: 'table' },
  'dbt_utils.sequential_values': { template: 'Column should increment sequentially[[, by {{interval}} {{datepart}}(s),]] with no gaps', level: 'column' },
  'dbt_utils.unique_combination_of_columns': { template: 'Table should have a unique combination of {{combination_of_columns}} across all rows', level: 'table' },
  'dbt_utils.accepted_range': { template: 'Column should only have values[[ between {{min_value}} and {{max_value}}]][[ (inclusive: {{inclusive}})]]', level: 'column' },

  // ── dbt_expectations ──
  'dbt_expectations.expect_column_to_exist': { template: 'Column should exist in the model', level: 'column' },
  'dbt_expectations.expect_row_values_to_have_recent_data': { template: 'Column should have data within the last {{interval}} {{datepart}}(s)', level: 'column' },
  'dbt_expectations.expect_grouped_row_values_to_have_recent_data': { template: 'Table should have recent data in {{timestamp_column}} within the last {{interval}} {{datepart}}(s) for each group in {{group_by}}', level: 'table' },
  'dbt_expectations.expect_table_aggregation_to_equal_other_table': { template: 'Table should have {{expression}} equal to [[{{compare_expression}} on ]]{{compare_model}}[[, within tolerance of {{tolerance}} or {{tolerance_percent}}%]]', level: 'table' },
  'dbt_expectations.expect_table_column_count_to_be_between': { template: 'Table should have [[between {{min_value}} and {{max_value}}]] columns', level: 'table' },
  'dbt_expectations.expect_table_column_count_to_equal_other_table': { template: 'Table should have the same number of columns as {{compare_model}}', level: 'table' },
  'dbt_expectations.expect_table_column_count_to_equal': { template: 'Table should have exactly {{value}} columns', level: 'table' },
  'dbt_expectations.expect_table_columns_to_not_contain_set': { template: 'Table should not contain any columns in {{column_list}}', level: 'table' },
  'dbt_expectations.expect_table_columns_to_contain_set': { template: 'Table should contain all columns in {{column_list}}', level: 'table' },
  'dbt_expectations.expect_table_columns_to_match_ordered_list': { template: 'Table should have columns that exactly match {{column_list}} in order', level: 'table' },
  'dbt_expectations.expect_table_columns_to_match_set': { template: 'Table should have columns that exactly match the set {{column_list}}', level: 'table' },
  'dbt_expectations.expect_table_row_count_to_be_between': { template: 'Table should have [[between {{min_value}} and {{max_value}}]] rows', level: 'table' },
  'dbt_expectations.expect_table_row_count_to_equal_other_table': { template: 'Table should have the same number of rows as {{compare_model}}', level: 'table' },
  'dbt_expectations.expect_table_row_count_to_equal_other_table_times_factor': { template: "Table should have a row count equal to {{compare_model}}'s row count multiplied by {{factor}}", level: 'table' },
  'dbt_expectations.expect_table_row_count_to_equal': { template: 'Table should have exactly {{value}} rows', level: 'table' },
  'dbt_expectations.expect_column_values_to_be_null': { template: 'Column should only contain NULL values', level: 'column' },
  'dbt_expectations.expect_column_values_to_not_be_null': { template: 'Column should not contain any NULL values', level: 'column' },
  'dbt_expectations.expect_column_values_to_be_unique': { template: 'Column should only contain unique values', level: 'column' },
  'dbt_expectations.expect_column_values_to_be_of_type': { template: 'Column should be of data type {{column_type}}', level: 'column' },
  'dbt_expectations.expect_column_values_to_be_in_type_list': { template: 'Column should have a data type that is one of {{column_type_list}}', level: 'column' },
  'dbt_expectations.expect_column_values_to_have_consistent_casing': { template: 'Column should have consistent letter casing across all string values', level: 'column' },
  'dbt_expectations.expect_column_values_to_be_in_set': { template: 'Column should only contain values from {{value_set}}', level: 'column' },
  'dbt_expectations.expect_column_values_to_not_be_in_set': { template: 'Column should not contain any values from {{value_set}}', level: 'column' },
  'dbt_expectations.expect_column_values_to_be_between': { template: 'Column should only have values [[between {{min_value}} and {{max_value}}]]', level: 'column' },
  'dbt_expectations.expect_column_values_to_be_decreasing': { template: 'Column should be in decreasing order when sorted by {{sort_column}}', level: 'column' },
  'dbt_expectations.expect_column_values_to_be_increasing': { template: 'Column should be in increasing order when sorted by {{sort_column}}', level: 'column' },
  'dbt_expectations.expect_column_value_lengths_to_be_between': { template: 'Column should have string lengths [[between {{min_value}} and {{max_value}} characters]]', level: 'column' },
  'dbt_expectations.expect_column_value_lengths_to_equal': { template: 'Column should have a string length of exactly {{value}} characters', level: 'column' },
  'dbt_expectations.expect_column_values_to_match_like_pattern': { template: 'Column should only have values matching the LIKE pattern {{like_pattern}}', level: 'column' },
  'dbt_expectations.expect_column_values_to_match_like_pattern_list': { template: 'Column should only have values matching at least one of the LIKE patterns in {{like_pattern_list}}', level: 'column' },
  'dbt_expectations.expect_column_values_to_match_regex': { template: 'Column should only have values matching the regex {{regex}}', level: 'column' },
  'dbt_expectations.expect_column_values_to_match_regex_list': { template: 'Column should only have values matching at least one regex in {{regex_list}}', level: 'column' },
  'dbt_expectations.expect_column_values_to_not_match_like_pattern': { template: 'Column should not have any values matching the LIKE pattern {{like_pattern}}', level: 'column' },
  'dbt_expectations.expect_column_values_to_not_match_like_pattern_list': { template: 'Column should not have any values matching any of the LIKE patterns in {{like_pattern_list}}', level: 'column' },
  'dbt_expectations.expect_column_values_to_not_match_regex': { template: 'Column should not have any values matching the regex {{regex}}', level: 'column' },
  'dbt_expectations.expect_column_values_to_not_match_regex_list': { template: 'Column should not have any values matching any regex in {{regex_list}}', level: 'column' },
  'dbt_expectations.expect_column_distinct_count_to_be_greater_than': { template: 'Column should have more than {{value}} distinct values', level: 'column' },
  'dbt_expectations.expect_column_distinct_count_to_be_less_than': { template: 'Column should have fewer than {{value}} distinct values', level: 'column' },
  'dbt_expectations.expect_column_distinct_count_to_equal_other_table': { template: 'Column should have the same distinct count as {{compare_column_name}} in {{compare_model}}', level: 'column' },
  'dbt_expectations.expect_column_distinct_count_to_equal': { template: 'Column should have exactly {{value}} distinct values', level: 'column' },
  'dbt_expectations.expect_column_distinct_values_to_be_in_set': { template: 'Column should only have distinct values that are members of {{value_set}}', level: 'column' },
  'dbt_expectations.expect_column_distinct_values_to_contain_set': { template: 'Column should have distinct values that include all of {{value_set}}', level: 'column' },
  'dbt_expectations.expect_column_distinct_values_to_equal_set': { template: 'Column should have distinct values that are exactly {{value_set}}', level: 'column' },
  'dbt_expectations.expect_column_max_to_be_between': { template: 'Column should have a maximum value [[between {{min_value}} and {{max_value}}]]', level: 'column' },
  'dbt_expectations.expect_column_mean_to_be_between': { template: 'Column should have a mean [[between {{min_value}} and {{max_value}}]]', level: 'column' },
  'dbt_expectations.expect_column_median_to_be_between': { template: 'Column should have a median [[between {{min_value}} and {{max_value}}]]', level: 'column' },
  'dbt_expectations.expect_column_min_to_be_between': { template: 'Column should have a minimum value [[between {{min_value}} and {{max_value}}]]', level: 'column' },
  'dbt_expectations.expect_column_most_common_value_to_be_in_set': { template: 'Column should have its most common value be one of {{value_set}}', level: 'column' },
  'dbt_expectations.expect_column_proportion_of_unique_values_to_be_between': { template: 'Column should have a proportion of unique values [[between {{min_value}} and {{max_value}}]]', level: 'column' },
  'dbt_expectations.expect_column_quantile_values_to_be_between': { template: 'Column should have its {{quantile}} quantile [[between {{min_value}} and {{max_value}}]]', level: 'column' },
  'dbt_expectations.expect_column_stdev_to_be_between': { template: 'Column should have a standard deviation [[between {{min_value}} and {{max_value}}]]', level: 'column' },
  'dbt_expectations.expect_column_sum_to_be_between': { template: 'Column should have a sum [[between {{min_value}} and {{max_value}}]]', level: 'column' },
  'dbt_expectations.expect_column_unique_value_count_to_be_between': { template: 'Column should have a unique value count [[between {{min_value}} and {{max_value}}]]', level: 'column' },
  'dbt_expectations.expect_column_pair_values_A_to_be_greater_than_B': { template: 'Table should have {{column_A}} greater than {{column_B}} for every row', level: 'table' },
  'dbt_expectations.expect_column_pair_values_to_be_equal': { template: 'Table should have {{column_A}} equal to {{column_B}} for every row', level: 'table' },
  'dbt_expectations.expect_column_pair_values_to_be_in_set': { template: 'Table should have the pair ({{column_A}}, {{column_B}}) be one of {{value_pairs_set}} for every row', level: 'table' },
  'dbt_expectations.expect_compound_columns_to_be_unique': { template: 'Table should have a unique combination of {{column_list}} for every row', level: 'table' },
  'dbt_expectations.expect_multicolumn_sum_to_equal': { template: 'Table should have the sum of {{column_list}} equal to {{sum_total}} for every row', level: 'table' },
  'dbt_expectations.expect_select_column_values_to_be_unique_within_record': { template: 'Table should have all values across {{column_list}} be distinct within each row', level: 'table' },
  'dbt_expectations.expect_column_values_to_be_within_n_moving_stdevs': { template: 'Column should have metric changes over {{date_column_name}} stay within [[{{sigma_threshold}} standard deviations]] of a [[{{trend_periods}}-period]] moving average', level: 'column' },
  'dbt_expectations.expect_column_values_to_be_within_n_stdevs': { template: 'Column should have its aggregated metric within [[{{sigma_threshold}} standard deviations]] of its average', level: 'column' },
  'dbt_expectations.expect_row_values_to_have_data_for_every_n_datepart': { template: 'Table should have data in {{date_col}} for every [[{{interval}} ]]{{date_part}}(s)[[ between {{test_start_date}} and {{test_end_date}}]]', level: 'table' },

  // ── elementary ──
  'elementary.volume_anomalies': { template: 'Table should have a row count[[ per {{time_bucket}}]] (based on {{timestamp_column}}) that does not deviate beyond [[{{anomaly_sensitivity}} standard deviations]] from historical patterns[[ over the {{training_period}} training window]]', level: 'table' },
  'elementary.freshness_anomalies': { template: 'Table should have the time between data updates (measured by {{timestamp_column}})[[ per {{time_bucket}}]] not deviate beyond [[{{anomaly_sensitivity}} standard deviations]] from historical freshness patterns', level: 'table' },
  'elementary.event_freshness_anomalies': { template: 'Table should have the lag between {{event_timestamp_column}}[[ and {{update_timestamp_column}}]] not deviate beyond [[{{anomaly_sensitivity}} standard deviations]] from historical patterns', level: 'table' },
  'elementary.dimension_anomalies': { template: 'Table should have the row count distribution across {{dimensions}} (bucketed by {{timestamp_column}}) not deviate beyond [[{{anomaly_sensitivity}} standard deviations]] from historical patterns', level: 'table' },
  'elementary.column_anomalies': { template: 'Column should have its {{column_anomalies}} metrics (bucketed by {{timestamp_column}}) not deviate beyond [[{{anomaly_sensitivity}} standard deviations]] from historical values', level: 'column' },
  'elementary.all_columns_anomalies': { template: 'Table should have {{column_anomalies}} metrics for all columns (bucketed by {{timestamp_column}}) not deviate beyond [[{{anomaly_sensitivity}} standard deviations]] from historical values', level: 'table' },
  'elementary.schema_changes': { template: 'Table should alert when it is deleted, columns are added/removed, or a column\'s data type changes', level: 'table' },
  'elementary.schema_changes_from_baseline': { template: 'Table should have no schema changes against baseline columns defined in the model/source YAML configuration', level: 'table' },
  'elementary.json_schema': { template: 'Column should only have values that conform to the JSON schema {{json_schema}}', level: 'column' },
  'elementary.exposure_schema_validity': { template: 'Table should have no column changes that would break downstream exposures', level: 'table' },
  
};

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
