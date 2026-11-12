// SPC Studio — synthetic demo datasets (seeded, so they are identical on every load).

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const fmtDate = (d) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

function days(start, n) {
  const out = [];
  const d = new Date(start + 'T00:00:00');
  for (let i = 0; i < n; i++) { out.push(fmtDate(d)); d.setDate(d.getDate() + 1); }
  return out;
}

export function buildDatasets() {
  // 1) Lab turnaround time — individuals, upper spec only.
  const r1 = rng(101);
  const tat = [];
  for (let i = 0; i < 60; i++) {
    let v = 38 + 4.2 * gauss(r1);
    if (i === 22) v += 17;            // analyser downtime
    if (i >= 44) v += 6;            // night-shift staffing change
    tat.push(round(v, 1));
  }

  // 2) Bottle fill volume — subgroups of 5, two-sided spec.
  const r2 = rng(202);
  const groups = [];
  for (let g = 0; g < 25; g++) {
    let shift = 0.55;
    if (g === 13) shift += 2.4;       // filler nozzle partly blocked
    if (g >= 18) shift += 0.22 * (g - 17); // drift: worn valve seal
    groups.push(Array.from({ length: 5 }, () => round(500 + shift + 0.85 * gauss(r2), 2)));
  }

  // 3) Discharge summaries with documentation errors — p chart, variable n.
  const r3 = rng(303);
  const defectives = [], sizes = [];
  for (let w = 0; w < 26; w++) {
    const n = 180 + Math.floor(r3() * 80);
    let p = 0.058;
    if (w === 16) p = 0.16;           // new EMR template roll-out week
    if (w >= 21) p = 0.03;            // checklist introduced
    let d = 0;
    for (let k = 0; k < n; k++) if (r3() < p) d++;
    defectives.push(d); sizes.push(n);
  }

  return [
    {
      id: 'tat', kind: 'individuals', source: 'demo',
      title: 'Lab turnaround time — STAT CBC',
      short: 'Lab turnaround time', unit: 'min', decimals: 1,
      labels: days('2026-09-01', 60), values: tat,
      lsl: null, usl: 55, target: null,
      context: 'Average daily time from STAT CBC order to result, 60 days. The service-level target is 55 minutes or less.',
    },
    {
      id: 'fill', kind: 'subgroups', source: 'demo',
      title: 'Bottle fill volume — Line 2',
      short: 'Bottle fill volume', unit: 'ml', decimals: 2,
      labels: Array.from({ length: 25 }, (_, i) => `Hour ${i + 1}`), groups,
      lsl: 497, usl: 503, target: 500,
      context: '5 bottles measured every hour for 25 hours. Spec: 500 ml ± 3 ml.',
    },
    {
      id: 'docerr', kind: 'attribute', source: 'demo',
      title: 'Discharge summaries with documentation errors',
      short: 'Documentation errors', unit: '%', decimals: 1,
      labels: Array.from({ length: 26 }, (_, i) => `Wk ${i + 1}`), defectives, sizes,
      context: 'Weekly audit of discharge summaries: how many had at least one documentation error.',
    },
    {
      id: 'pareto-doc', kind: 'pareto', source: 'demo',
      title: 'Documentation error types', short: 'Error types', unit: 'errors',
      items: [
        { category: 'Missing physician signature', count: 124 },
        { category: 'Incomplete medication reconciliation', count: 88 },
        { category: 'Wrong or missing date/time', count: 46 },
        { category: 'Missing diagnosis code', count: 22 },
        { category: 'Illegible entry', count: 14 },
        { category: 'Missing allergy information', count: 10 },
        { category: 'Others', count: 8 },
      ],
      context: 'All documentation errors found in the 26-week audit, by type.',
    },
    {
      id: 'pareto-cmp', kind: 'pareto', source: 'demo',
      title: 'Patient complaints by category', short: 'Patient complaints', unit: 'complaints',
      items: [
        { category: 'Long waiting time', count: 142 },
        { category: 'Billing concerns', count: 87 },
        { category: 'Staff communication', count: 54 },
        { category: 'Room cleanliness', count: 31 },
        { category: 'Food quality', count: 22 },
        { category: 'Parking', count: 18 },
        { category: 'Others', count: 12 },
      ],
      context: 'Complaints logged at the patient relations desk over 6 months.',
    },
  ];
}
