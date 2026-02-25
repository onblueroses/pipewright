export const CONDITION_TYPES = [
  'equals', 'not_equals', 'greater_than', 'less_than',
  'contains', 'not_contains', 'exists', 'not_exists',
] as const;

export type ConditionType = typeof CONDITION_TYPES[number];

export function evaluate(condition: ConditionType, resolved: unknown, compareValue: unknown): boolean {
  switch (condition) {
    case 'exists':
      return resolved !== undefined && resolved !== null;
    case 'equals':
      return resolved === compareValue;
    case 'not_equals':
      return resolved !== compareValue;
    case 'greater_than':
      return coerceNumericComparison(resolved, compareValue, (a, b) => a > b);
    case 'less_than':
      return coerceNumericComparison(resolved, compareValue, (a, b) => a < b);
    case 'contains':
      if (typeof resolved === 'string' && typeof compareValue === 'string') {
        return resolved.includes(compareValue);
      }
      if (Array.isArray(resolved)) {
        return resolved.includes(compareValue);
      }
      return false;
    case 'not_contains':
      return !evaluate('contains', resolved, compareValue);
    case 'not_exists':
      return !evaluate('exists', resolved, compareValue);
  }
}

function coerceNumericComparison(
  a: unknown,
  b: unknown,
  compare: (a: number, b: number) => boolean
): boolean {
  const numA = toNumber(a);
  const numB = toNumber(b);
  if (numA === null || numB === null) return false;
  return compare(numA, numB);
}

function toNumber(val: unknown): number | null {
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val === 'string') {
    const n = Number(val);
    return isNaN(n) || val.trim() === '' ? null : n;
  }
  return null;
}
