/**
 * Normalizes a typed US patent number: "10,000,000", "US10000000B2",
 * "U.S. Pat. No. 7,654,321", "D912,345" → "10000000", "7654321", "D912345".
 * Returns null for anything that is not a granted-patent number (for example
 * an application number such as "18/402,117").
 */
export function normalizePatentNumber(input: string): string | null {
  const raw = input.trim().toUpperCase().replace(/^U\.?S\.?\s*(PAT(ENT)?\.?\s*)?(NO\.?\s*)?/, '').replace(/^US/, '');
  if (raw.includes('/')) return null;
  const match = raw.match(/^(RE|D|PP)?\s*([\d,\s]+?)\s*(?:[ABSEPH]\d?)?$/);
  if (!match) return null;
  const prefix = match[1] ?? '';
  const digits = match[2].replace(/[,\s]/g, '').replace(/^0+/, '');
  if (!/^\d+$/.test(digits)) return null;
  if (prefix ? digits.length < 4 || digits.length > 7 : digits.length < 6 || digits.length > 8) return null;
  return prefix + digits;
}

export function parsePatentNumbers(input: string): string[] {
  const parts = input.split(/[;\n]|,\s+|\s{2,}|\s+(?=US|D\d|RE\d)/i);
  return [...new Set(parts.map(normalizePatentNumber).filter((n): n is string => !!n))];
}

/** Finds patent numbers written in matter text, e.g. "U.S. Patent No. 9,876,543" or "US9876543B2". */
export function detectPatentNumbers(text: string): string[] {
  const found = new Set<string>();
  const pattern = /\b(?:U\.?S\.?\s*(?:Pat(?:ent)?\.?\s*)?(?:No\.?\s*)?)?(\d{1,2},\d{3},\d{3})\b|\bUS\s?(\d{7,8})\s?[AB]\d\b|\bU\.?S\.?\s*Pat(?:ent)?\.?\s*No\.?\s*(D\d{3},\d{3})/gi;
  for (const match of text.matchAll(pattern)) {
    const number = normalizePatentNumber(match[1] ?? match[2] ?? match[3] ?? '');
    if (number) found.add(number);
  }
  return [...found];
}
