// Lightweight fuzzy matching used to find existing projects/tasks/activities
// before creating new ones (avoids duplicates like "Carlos V" vs "Proyecto Carlos 5").

const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'en', 'para', 'por',
  'con', 'a', 'al', 'lo', 'se', 'que', 'mi', 'mis', 'the', 'of', 'and', 'to', 'for', 'in', 'on', 'with',
  'proyecto', 'project', 'tarea', 'task'
]);

const ROMAN = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };

const normalize = (text) => String(text || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokens = (text) => normalize(text)
  .split(' ')
  .filter((t) => t && !STOPWORDS.has(t))
  .map((t) => ROMAN[t] || t);

const bigrams = (s) => {
  const str = ` ${s} `;
  const out = [];
  for (let i = 0; i < str.length - 1; i += 1) out.push(str.slice(i, i + 2));
  return out;
};

const dice = (a, b) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  const counts = new Map();
  A.forEach((g) => counts.set(g, (counts.get(g) || 0) + 1));
  let inter = 0;
  B.forEach((g) => {
    const c = counts.get(g);
    if (c) {
      inter += 1;
      counts.set(g, c - 1);
    }
  });
  return (2 * inter) / (A.length + B.length);
};

// Token match tolerant to small typos / plurals ("integracion" ~ "integraciones")
const commonPrefix = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
};
const tokenMatch = (a, b) => a === b || (a.length > 3 && b.length > 3 && (
  a.startsWith(b) || b.startsWith(a) || dice(a, b) >= 0.75 || commonPrefix(a, b) >= 5
));

// Score 0..1
const similarity = (query, candidate) => {
  const qt = tokens(query);
  const ct = tokens(candidate);
  if (!qt.length || !ct.length) return 0;
  const qn = qt.join(' ');
  const cn = ct.join(' ');
  if (qn === cn) return 1;

  const matchedQ = qt.filter((q) => ct.some((c) => tokenMatch(q, c))).length;
  const matchedC = ct.filter((c) => qt.some((q) => tokenMatch(q, c))).length;
  const coverage = matchedQ / qt.length;          // how much of the query is in the candidate
  const precision = matchedC / ct.length;         // how much of the candidate is in the query
  const tokenScore = (2 * coverage * precision) / ((coverage + precision) || 1);
  const charScore = dice(qn, cn);
  const contains = cn.includes(qn) || qn.includes(cn) ? 0.15 : 0;

  return Math.min(1, Math.max(tokenScore * 0.65 + charScore * 0.35 + contains, coverage === 1 ? 0.7 : 0));
};

// items: array, getText: item -> string | string[]
const rankBySimilarity = (query, items, getText, { min = 0.35, limit = 8 } = {}) => items
  .map((item) => {
    const texts = [].concat(getText(item)).filter(Boolean);
    const score = texts.reduce((best, t) => Math.max(best, similarity(query, t)), 0);
    return { item, score: Math.round(score * 100) / 100 };
  })
  .filter((r) => r.score >= min)
  .sort((a, b) => b.score - a.score)
  .slice(0, limit);

module.exports = { normalize, tokens, similarity, rankBySimilarity };
