// SPC Studio — statistics engine (pure functions, no DOM). Runs in the browser and in Node for testing.

// Control-chart constants by subgroup size n (ASTM / Montgomery tables).
export const CONST = {
  2: { d2: 1.128, A2: 1.880, D3: 0, D4: 3.267 },
  3: { d2: 1.693, A2: 1.023, D3: 0, D4: 2.574 },
  4: { d2: 2.059, A2: 0.729, D3: 0, D4: 2.282 },
  5: { d2: 2.326, A2: 0.577, D3: 0, D4: 2.114 },
  6: { d2: 2.534, A2: 0.483, D3: 0, D4: 2.004 },
  7: { d2: 2.704, A2: 0.419, D3: 0.076, D4: 1.924 },
  8: { d2: 2.847, A2: 0.373, D3: 0.136, D4: 1.864 },
  9: { d2: 2.970, A2: 0.337, D3: 0.184, D4: 1.816 },
  10: { d2: 3.078, A2: 0.308, D3: 0.223, D4: 1.777 },
};

export const sum = (a) => a.reduce((s, v) => s + v, 0);
export const mean = (a) => sum(a) / a.length;
export function sd(a) {
  const m = mean(a);
  return Math.sqrt(sum(a.map((v) => (v - m) ** 2)) / (a.length - 1));
}

// ---------- normal distribution ----------
// Complementary error function.
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  // Numerical Recipes erfcc (fractional error < 1.2e-7) — ample for PPM reporting.
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
export const normCdf = (z) => 0.5 * erfc(-z / Math.SQRT2);
// Inverse normal CDF (Acklam's algorithm, relative error < 1.15e-9).
export function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ---------- control charts ----------
// Individuals & Moving Range (moving range of span 2).
export function imr(x) {
  if (x.length < 3) throw new Error('Need at least 3 values for an I-MR chart.');
  const mr = [null];
  for (let i = 1; i < x.length; i++) mr.push(Math.abs(x[i] - x[i - 1]));
  const mrBar = mean(mr.slice(1));
  const sigmaW = mrBar / CONST[2].d2;
  const cl = mean(x);
  return {
    type: 'imr', points: x, center: cl, sigma: sigmaW,
    ucl: cl + 3 * sigmaW, lcl: cl - 3 * sigmaW,
    sub: { name: 'Moving Range', points: mr, center: mrBar, ucl: CONST[2].D4 * mrBar, lcl: CONST[2].D3 * mrBar },
    sigmaWithin: sigmaW, n: 1,
  };
}

// X-bar & R for equal subgroups of size 2..10.
export function xbarR(groups) {
  const n = groups[0].length;
  if (!CONST[n]) throw new Error('Subgroup size must be between 2 and 10.');
  if (groups.some((g) => g.length !== n)) throw new Error('All subgroups must be the same size.');
  if (groups.length < 2) throw new Error('Need at least 2 subgroups.');
  const { d2, A2, D3, D4 } = CONST[n];
  const means = groups.map(mean);
  const ranges = groups.map((g) => Math.max(...g) - Math.min(...g));
  const xbb = mean(means);
  const rBar = mean(ranges);
  const sigmaW = rBar / d2;
  return {
    type: 'xbarr', points: means, center: xbb, sigma: sigmaW / Math.sqrt(n),
    ucl: xbb + A2 * rBar, lcl: xbb - A2 * rBar,
    sub: { name: 'Range', points: ranges, center: rBar, ucl: D4 * rBar, lcl: D3 * rBar },
    sigmaWithin: sigmaW, n,
  };
}

// p chart (proportion defective) with variable sample sizes.
export function pChart(defectives, sizes) {
  if (defectives.length !== sizes.length) throw new Error('Defectives and sample sizes must line up.');
  if (sizes.some((n) => !(n > 0))) throw new Error('Every sample size must be greater than 0.');
  if (defectives.some((d, i) => d < 0 || d > sizes[i])) throw new Error('Defectives must be between 0 and the sample size.');
  const pBar = sum(defectives) / sum(sizes);
  const p = defectives.map((d, i) => d / sizes[i]);
  const sig = sizes.map((n) => Math.sqrt(pBar * (1 - pBar) / n));
  return {
    type: 'p', points: p, center: pBar, sigmaArr: sig,
    uclArr: sig.map((s) => Math.min(1, pBar + 3 * s)),
    lclArr: sig.map((s) => Math.max(0, pBar - 3 * s)),
    sizes,
  };
}

// Western Electric rules 1–4 + Nelson trend rule, evaluated on z-scores (distance from centre in sigmas).
export const RULES = {
  1: 'One point beyond 3σ (outside the control limits)',
  2: '2 of 3 consecutive points beyond 2σ on the same side',
  3: '4 of 5 consecutive points beyond 1σ on the same side',
  4: '8 consecutive points on the same side of the centre line',
  5: '6 consecutive points steadily increasing or decreasing (trend)',
};
export function zScores(chart) {
  return chart.points.map((v, i) => {
    const s = chart.sigmaArr ? chart.sigmaArr[i] : chart.sigma;
    return s > 0 ? (v - chart.center) / s : 0;
  });
}
export function runRules(z, raw = z) {
  const hits = []; // {i, rule}
  const add = (i, rule) => { if (!hits.some((h) => h.i === i && h.rule === rule)) hits.push({ i, rule }); };
  for (let i = 0; i < z.length; i++) {
    if (Math.abs(z[i]) > 3) add(i, 1);
    for (const s of [1, -1]) {
      if (i >= 2) { const w = z.slice(i - 2, i + 1); if (s * z[i] > 2 && w.filter((v) => s * v > 2).length >= 2) add(i, 2); }
      if (i >= 4) { const w = z.slice(i - 4, i + 1); if (s * z[i] > 1 && w.filter((v) => s * v > 1).length >= 4) add(i, 3); }
      if (i >= 7) { const w = z.slice(i - 7, i + 1); if (w.every((v) => s * v > 0)) add(i, 4); }
    }
    if (i >= 5) {
      const w = raw.slice(i - 5, i + 1);
      let up = true, down = true;
      for (let k = 1; k < w.length; k++) { if (!(w[k] > w[k - 1])) up = false; if (!(w[k] < w[k - 1])) down = false; }
      if (up || down) add(i, 5);
    }
  }
  return hits.sort((a, b) => a.i - b.i || a.rule - b.rule);
}
export function signals(chart) {
  return runRules(zScores(chart), chart.points);
}
// Secondary (MR / R) chart: only rule 1 is meaningful.
export function subSignals(sub) {
  const out = [];
  sub.points.forEach((v, i) => { if (v != null && (v > sub.ucl + 1e-12 || v < sub.lcl - 1e-12)) out.push({ i, rule: 1 }); });
  return out;
}

// ---------- capability ----------
// lsl/usl may be null for one-sided specs. sigmaWithin from the control chart; overall = sample SD.
export function capability(x, sigmaWithin, lsl, usl, target = null) {
  const m = mean(x);
  const so = sd(x);
  const sw = sigmaWithin;
  const has = (v) => v !== null && v !== undefined && Number.isFinite(v);
  const res = { mean: m, sigmaWithin: sw, sigmaOverall: so, n: x.length, lsl, usl, target };
  const two = has(lsl) && has(usl);
  res.Cp = two ? (usl - lsl) / (6 * sw) : null;
  res.Pp = two ? (usl - lsl) / (6 * so) : null;
  res.Cpu = has(usl) ? (usl - m) / (3 * sw) : null;
  res.Cpl = has(lsl) ? (m - lsl) / (3 * sw) : null;
  res.Ppu = has(usl) ? (usl - m) / (3 * so) : null;
  res.Ppl = has(lsl) ? (m - lsl) / (3 * so) : null;
  res.Cpk = Math.min(...[res.Cpu, res.Cpl].filter((v) => v !== null));
  res.Ppk = Math.min(...[res.Ppu, res.Ppl].filter((v) => v !== null));
  if (two && has(target)) res.Cpm = (usl - lsl) / (6 * Math.sqrt(so ** 2 + (m - target) ** 2));
  const tail = (s) => (has(lsl) ? normCdf((lsl - m) / s) : 0) + (has(usl) ? 1 - normCdf((usl - m) / s) : 0);
  res.ppmWithin = tail(sw) * 1e6;
  res.ppmOverall = tail(so) * 1e6;
  res.ppmObserved = (x.filter((v) => (has(lsl) && v < lsl) || (has(usl) && v > usl)).length / x.length) * 1e6;
  res.zBenchWithin = -normInv(tail(sw));
  res.zBenchOverall = -normInv(tail(so));
  // Six Sigma convention: long-term Z.bench + 1.5σ shift = short-term "sigma level".
  res.sigmaLevel = res.zBenchOverall + 1.5;
  return res;
}

export function verdict(cpk) {
  if (!Number.isFinite(cpk)) return { key: 'na', label: 'n/a' };
  if (cpk >= 1.67) return { key: 'lo', label: 'Excellent' };
  if (cpk >= 1.33) return { key: 'lo', label: 'Capable' };
  if (cpk >= 1.0) return { key: 'mid', label: 'Marginal' };
  return { key: 'hi', label: 'Not capable' };
}

// ---------- normality: Anderson–Darling (mean & variance estimated) ----------
export function andersonDarling(x) {
  const n = x.length;
  const m = mean(x), s = sd(x);
  const y = [...x].sort((a, b) => a - b).map((v) => normCdf((v - m) / s));
  const eps = 1e-12;
  let S = 0;
  for (let i = 0; i < n; i++) {
    S += (2 * (i + 1) - 1) * (Math.log(Math.max(y[i], eps)) + Math.log(Math.max(1 - y[n - 1 - i], eps)));
  }
  const A2 = -n - S / n;
  const A = A2 * (1 + 0.75 / n + 2.25 / (n * n));
  let p;
  if (A >= 0.6) p = Math.exp(1.2937 - 5.709 * A + 0.0186 * A * A);
  else if (A >= 0.34) p = Math.exp(0.9177 - 4.279 * A - 1.38 * A * A);
  else if (A >= 0.2) p = 1 - Math.exp(-8.318 + 42.796 * A - 59.938 * A * A);
  else p = 1 - Math.exp(-13.436 + 101.14 * A - 223.73 * A * A);
  return { A2, Astar: A, p: Math.min(1, Math.max(0, p)) };
}

// ---------- histogram & Pareto ----------
export function histogram(x, extra = []) {
  const vals = [...x, ...extra.filter((v) => Number.isFinite(v))];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const k = Math.max(6, Math.min(25, Math.ceil(Math.log2(x.length) + 1) + 3)); // Sturges, a little finer
  const w = (hi - lo) / k || 1;
  const bins = Array.from({ length: k }, (_, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, count: 0 }));
  for (const v of x) { let i = Math.floor((v - lo) / w); if (i >= k) i = k - 1; if (i < 0) i = 0; bins[i].count++; }
  return { bins, width: w, lo, hi };
}
export const normPdf = (v, m, s) => Math.exp(-0.5 * ((v - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));

export function pareto(items) {
  // items: [{category, count}] (duplicates are merged)
  const map = new Map();
  for (const { category, count } of items) {
    const k = String(category).trim() || '(blank)';
    map.set(k, (map.get(k) || 0) + (Number(count) || 0));
  }
  const rows = [...map.entries()].map(([category, count]) => ({ category, count })).filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  const total = sum(rows.map((r) => r.count));
  let cum = 0;
  for (const r of rows) { cum += r.count; r.pct = (r.count / total) * 100; r.cumPct = (cum / total) * 100; }
  // "Vital few": categories up to and including the one that crosses 80%.
  let vital = rows.findIndex((r) => r.cumPct >= 80) + 1;
  if (vital <= 0) vital = rows.length;
  rows.forEach((r, i) => { r.vital = i < vital; });
  return { rows, total, vitalCount: vital, vitalPct: rows[vital - 1]?.cumPct ?? 100 };
}
