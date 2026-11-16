// Shared helpers. No external dependencies.

export const TIER_RANK = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 };

export function tierMax(a, b) {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export function compare(actual, op, expected) {
  switch (op) {
    case '>=': return actual >= expected;
    case '<=': return actual <= expected;
    case '>': return actual > expected;
    case '<': return actual < expected;
    case '==': return actual === expected;
    case '!=': return actual !== expected;
    default: throw new Error(`Unknown operator: ${op}`);
  }
}

// Deterministic PRNG (mulberry32) so simulations and tests are reproducible.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normal(rand, mean = 0, sd = 1) {
  const u = Math.max(rand(), Number.EPSILON);
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Marsaglia–Tsang gamma sampler; used for Beta draws in Thompson sampling.
export function gamma(rand, shape) {
  if (shape < 1) return gamma(rand, shape + 1) * Math.pow(rand(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(rand); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function beta(rand, a, b) {
  const x = gamma(rand, a);
  const y = gamma(rand, b);
  return x / (x + y);
}

export function quantile(sorted, q) {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
