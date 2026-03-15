/**
 * Score a model name against a query for relevance ranking.
 * Higher score = better match. Returns -1 for no match.
 *
 * Signals (in priority order):
 *  1. Exact match (1000)
 *  2. Starts with query (500)
 *  3. Segment starts with query — e.g. query matches after _ or . (300)
 *  4. Contains query as substring — earlier position scores higher (100–199)
 *  5. Length similarity bonus — shorter names rank higher for same match type
 */
export function scoreMatch(name: string, query: string): number {
  const nl = name.toLowerCase();
  const ql = query.toLowerCase();

  const idx = nl.indexOf(ql);
  if (idx === -1) return -1;

  // Length-closeness bonus: prefer shorter (more precise) names (0–50)
  const lengthBonus = Math.max(0, 50 - (nl.length - ql.length));

  // Exact match
  if (nl === ql) return 1000 + lengthBonus;

  // Starts with
  if (idx === 0) return 500 + lengthBonus;

  // Segment boundary: char before match is _ . or /
  const charBefore = nl[idx - 1];
  if (charBefore === '_' || charBefore === '.' || charBefore === '/') {
    return 300 + lengthBonus;
  }

  // Substring match: earlier position → higher score
  const positionScore = Math.max(0, 99 - idx);
  return 100 + positionScore + lengthBonus;
}

/**
 * Filter and sort a list of names by relevance to a query.
 * Returns matched names sorted by descending score.
 */
export function filterByRelevance(names: string[], query: string, limit?: number): string[] {
  const scored: { name: string; score: number }[] = [];
  for (const n of names) {
    const s = scoreMatch(n, query);
    if (s >= 0) scored.push({ name: n, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  const result = scored.map((s) => s.name);
  return limit ? result.slice(0, limit) : result;
}
