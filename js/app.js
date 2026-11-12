// SPC Studio — UI. Statistics live in stats.js; demo data in data.js.
import * as S from './stats.js';
import { buildDatasets } from './data.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = {
  datasets: buildDatasets(),
  sel: { control: 'tat', capability: 'fill', pareto: 'pareto-doc' },
  tab: 'overview',
  charts: {},
};
window.SPC = state; // handy for testing in the console

// ---------- formatting ----------
const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtPpm = (v) => (v == null || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString('en-US'));
const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
const byId = (id) => state.datasets.find((d) => d.id === id);
const isVar = (d) => d.kind === 'individuals' || d.kind === 'subgroups';
const hasSpec = (d) => Number.isFinite(d.lsl) || Number.isFinite(d.usl);
function valFmt(ds, v) { return ds.kind === 'attribute' ? pct(v) : fmt(v, ds.decimals ?? 2); }
function unitStr(ds) { return ds.kind === 'attribute' ? '' : ds.unit ? ' ' + ds.unit : ''; }
// Which direction is "good"? (used to explain signals)
function lowerIsBetter(ds) {
  if (ds.kind === 'attribute') return true;
  if (Number.isFinite(ds.usl) && !Number.isFinite(ds.lsl)) return true;
  if (Number.isFinite(ds.lsl) && !Number.isFinite(ds.usl)) return false;
  return null;
}

// ---------- analysis (cached per dataset) ----------
function analyse(ds) {
  const key = JSON.stringify([ds.lsl, ds.usl, ds.target]);
  if (ds._r && ds._r.key === key) return ds._r;
  const r = { key };
  if (ds.kind === 'individuals') { r.chart = S.imr(ds.values); r.values = ds.values; }
  if (ds.kind === 'subgroups') { r.chart = S.xbarR(ds.groups); r.values = ds.groups.flat(); }
  if (ds.kind === 'attribute') r.chart = S.pChart(ds.defectives, ds.sizes);
  if (ds.kind === 'pareto') r.par = S.pareto(ds.items);
  if (r.chart) {
    r.sig = S.signals(r.chart);
    r.subSig = r.chart.sub ? S.subSignals(r.chart.sub) : [];
    r.z = S.zScores(r.chart);
  }
  if (isVar(ds)) {
    r.ad = S.andersonDarling(r.values);
    if (hasSpec(ds)) r.cap = S.capability(r.values, r.chart.sigmaWithin, ds.lsl, ds.usl, ds.target);
  }
  ds._r = r;
  return r;
}
function signalPoints(r) { return [...new Set(r.sig.map((s) => s.i))]; }

// Plain-English stability summary.
function stabilityStory(ds, r) {
  const n = r.chart.points.length;
  const pts = signalPoints(r);
  if (!pts.length && !r.subSig.length) {
    return { ok: true, short: 'Stable', html: `✅ <b>Stable and predictable.</b> All ${n} points are inside the control limits with no unusual patterns. Variation here is "common cause" — to improve further you must change the process itself, not chase individual points.` };
  }
  const ev = events(ds, r);
  const parts = ev.map((e) => e.html);
  if (r.subSig.length) parts.push(`${r.subSig.length} point(s) with an unusually large ${r.chart.sub.name.toLowerCase()} (sudden jumps)`);
  const total = new Set([...pts, ...r.subSig.map((s) => s.i)]).size;
  return {
    ok: false, short: `${total} signal${total > 1 ? 's' : ''}`, events: ev,
    html: `⚠️ <b>Not stable — ${total} point${total > 1 ? 's' : ''} flagged out of ${n}.</b> The chart shows ${parts.join('; ')}. These are "special causes": find out what changed at those times. ${ev.some((e) => e.good) ? 'Remove the causes of the bad signals (and make the good ones standard)' : 'Remove those causes'} before judging capability.`,
  };
}
// Turn rule hits into a few human-readable events.
function events(ds, r) {
  const lib = lowerIsBetter(ds);
  const tag = (up) => (lib === null ? '' : up === !lib ? ' <i>(better than usual)</i>' : '');
  const out = [];
  for (const s of r.sig.filter((s) => s.rule === 1)) {
    const up = r.z[s.i] > 0;
    out.push({ i: s.i, good: !!tag(up), html: `<b>${esc(ds.labels[s.i])}</b> (${valFmt(ds, r.chart.points[s.i])}${unitStr(ds)}) ${up ? 'above the upper' : 'below the lower'} control limit${tag(up)}` });
  }
  const runs = r.sig.filter((s) => s.rule >= 2);
  const clusters = [];
  for (const s of runs) {
    const last = clusters[clusters.length - 1];
    if (last && s.i - last[last.length - 1].i <= 8) last.push(s); else clusters.push([s]);
  }
  const r1 = new Set(r.sig.filter((s) => s.rule === 1).map((s) => s.i));
  for (const c of clusters) {
    const rules = new Set(c.map((s) => s.rule));
    if (rules.size === 1 && rules.has(2) && c.every((s) => r1.has(s.i) || r1.has(s.i - 1))) continue; // already described as an out-of-limit point
    const first = c[0], end = c[c.length - 1];
    const pts = r.chart.points;
    if (rules.size === 1 && rules.has(5)) {
      const up = pts[end.i] > pts[Math.max(0, end.i - 5)];
      out.push({ i: first.i, good: !!tag(up), html: `a steady <b>${up ? 'upward' : 'downward'} trend</b> up to <b>${esc(ds.labels[end.i])}</b>${tag(up)}` });
      continue;
    }
    const lead = c.find((s) => s.rule !== 5) || first;
    const up = r.z[lead.i] > 0;
    const span = lead.rule === 2 ? 2 : lead.rule === 3 ? 4 : 7;
    if (rules.has(3) || rules.has(4)) {
      out.push({ i: lead.i, good: !!tag(up), html: `a sustained <b>${up ? 'upward' : 'downward'} shift</b> from about <b>${esc(ds.labels[Math.max(0, lead.i - span)])}</b>${tag(up)}` });
    } else {
      out.push({ i: lead.i, good: !!tag(up), html: `unusually <b>${up ? 'high' : 'low'}</b> values around <b>${esc(ds.labels[lead.i])}</b>${tag(up)}` });
    }
  }
  return out.sort((a, b) => a.i - b.i);
}

function capabilityStory(ds, r) {
  const c = r.cap;
  if (!c) return 'Enter at least one specification limit above to calculate capability.';
  const v = S.verdict(c.Cpk);
  const u = unitStr(ds);
  let s = `${v.key === 'lo' ? '✅' : v.key === 'mid' ? '🟠' : '⚠️'} <b>Cpk = ${fmt(c.Cpk)} — ${v.label.toLowerCase()}.</b> `;
  s += `Expect about <b>${fmtPpm(c.ppmOverall)} defects per million</b> (${(c.ppmOverall / 1e4).toFixed(2)}% outside spec) at the current performance (Ppk ${fmt(c.Ppk)}). `;
  if (c.Cp != null && c.Cp - c.Cpk > 0.1) {
    const mid = Number.isFinite(ds.target) ? ds.target : (ds.lsl + ds.usl) / 2;
    s += `The spread would fit (Cp ${fmt(c.Cp)}), but the process runs <b>off-centre by ${fmt(c.mean - mid, ds.decimals ?? 2)}${u}</b> — re-centring alone would lift Cpk to about ${fmt(c.Cp)}. `;
  }
  if (c.Ppk < 0.85 * c.Cpk) s += `Actual performance (Ppk ${fmt(c.Ppk)}) is clearly worse than short-term (Cpk ${fmt(c.Cpk)}): shifts or drift over time are costing you — see the control chart. `;
  if (!stabilityStory(ds, r).ok) s += '<br><small>Note: the process is not yet stable, so treat these numbers as a snapshot rather than a prediction.</small>';
  return s;
}

// ---------- charts ----------
function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function palette() {
  return { ink: css('--ink'), muted: css('--muted'), line: css('--line'), brand: css('--brand'), brand2: css('--brand-2'), hi: css('--risk-hi'), mid: css('--risk-mid'), lo: css('--risk-lo'), card: css('--card') };
}
function chart(id) {
  const el = $(id);
  let c = state.charts[id];
  if (c && c.getDom() !== el) { c.dispose(); c = null; }
  if (!c) { c = echarts.init(el, null, { renderer: 'canvas' }); state.charts[id] = c; }
  return c;
}
function baseOpt(p) {
  return {
    textStyle: { fontFamily: 'Inter, Segoe UI, sans-serif', color: p.ink },
    grid: { left: 56, right: 70, top: 24, bottom: 40 },
    tooltip: { trigger: 'axis', backgroundColor: p.card, borderColor: p.line, textStyle: { color: p.ink } },
    animationDuration: 500,
  };
}
const axisStyle = (p) => ({ axisLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted }, splitLine: { lineStyle: { color: p.line, type: 'dashed' } } });

function renderControlChart(ds, r) {
  const p = palette();
  const c = r.chart;
  const flagged = new Map();
  for (const s of r.sig) flagged.set(s.i, [...(flagged.get(s.i) || []), s.rule]);
  const data = c.points.map((v, i) => ({ value: v, itemStyle: flagged.has(i) ? { color: p.hi, borderColor: p.hi } : { color: p.brand }, symbolSize: flagged.has(i) ? 10 : 6 }));
  const isP = ds.kind === 'attribute';
  const yf = (v) => (isP ? (v * 100).toFixed(1) + '%' : fmt(v, ds.decimals ?? 2));
  const series = [{
    name: isP ? 'Proportion' : ds.kind === 'subgroups' ? 'Subgroup mean' : 'Value', type: 'line', data, symbol: 'circle',
    lineStyle: { color: p.brand, width: 1.6 }, z: 5,
  }];
  const lim = { type: 'line', symbol: 'none', silent: true, lineStyle: { color: p.hi, type: 'dashed', width: 1.4 }, step: 'middle' };
  if (isP) {
    series.push({ ...lim, name: 'UCL', data: c.uclArr }, { ...lim, name: 'LCL', data: c.lclArr },
      { type: 'line', name: 'CL', symbol: 'none', silent: true, data: c.points.map(() => c.center), lineStyle: { color: p.lo, width: 1.4 } });
  } else {
    const ml = [
      { yAxis: c.ucl, name: 'UCL', lineStyle: { color: p.hi, type: 'dashed', width: 1.4 } },
      { yAxis: c.center, name: 'CL', lineStyle: { color: p.lo, width: 1.4 } },
      { yAxis: c.lcl, name: 'LCL', lineStyle: { color: p.hi, type: 'dashed', width: 1.4 } },
    ];
    series[0].markLine = { symbol: 'none', silent: true, data: ml, label: { position: 'end', color: p.muted, formatter: (d) => `${d.name}\n${yf(d.value)}` } };
    if ($('zones').checked) {
      const s = c.sigma, m = c.center;
      const band = (a, b, o) => [{ yAxis: a, itemStyle: { color: hexA(p.brand, o) } }, { yAxis: b }];
      series[0].markArea = { silent: true, data: [band(m + s, m + 2 * s, 0.06), band(m - 2 * s, m - s, 0.06), band(m + 2 * s, m + 3 * s, 0.12), band(m - 3 * s, m - 2 * s, 0.12)] };
    }
    if (ds.kind === 'individuals' && hasSpec(ds)) {
      for (const [v, n] of [[ds.usl, 'USL'], [ds.lsl, 'LSL']]) if (Number.isFinite(v)) ml.push({ yAxis: v, name: n, lineStyle: { color: p.mid, type: 'dotted', width: 1.6 }, label: { position: 'insideStartTop', color: p.mid, formatter: `${n} (spec) ${yf(v)}` } });
    }
  }
  const all = [...c.points, ...(isP ? [...c.uclArr, ...c.lclArr] : [c.ucl, c.lcl])];
  if (ds.kind === 'individuals') for (const v of [ds.usl, ds.lsl]) if (Number.isFinite(v)) all.push(v);
  const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.08;
  chart('chMain').setOption({
    ...baseOpt(p),
    tooltip: {
      ...baseOpt(p).tooltip,
      formatter: (items) => {
        const i = items[0].dataIndex;
        let h = `<b>${esc(ds.labels[i])}</b><br>${items[0].seriesName}: <b>${yf(c.points[i])}</b>${isP ? ` (${ds.defectives[i]} of ${ds.sizes[i]})` : ''}`;
        if (isP) h += `<br>Limits: ${yf(c.lclArr[i])} – ${yf(c.uclArr[i])}`;
        if (flagged.has(i)) h += '<br><span style="color:' + p.hi + '">⚠ ' + flagged.get(i).map((k) => 'Rule ' + k + ': ' + S.RULES[k]).join('<br>⚠ ') + '</span>';
        return h;
      },
    },
    xAxis: { type: 'category', data: ds.labels, ...axisStyle(p), splitLine: { show: false } },
    yAxis: { type: 'value', min: isP ? Math.max(0, lo - pad) : lo - pad, max: hi + pad, scale: true, ...axisStyle(p), axisLabel: { color: p.muted, formatter: yf } },
    series,
  }, true);

  // secondary chart
  if (c.sub) {
    $('subCard').hidden = false;
    $('subTitle').innerHTML = `${c.sub.name} chart <small>${ds.kind === 'individuals' ? 'difference between consecutive values' : 'max − min within each subgroup'}</small>`;
    const sf = new Set(r.subSig.map((s) => s.i));
    chart('chSub').setOption({
      ...baseOpt(p),
      xAxis: { type: 'category', data: ds.labels, ...axisStyle(p), splitLine: { show: false } },
      yAxis: { type: 'value', ...axisStyle(p), axisLabel: { color: p.muted, formatter: (v) => fmt(v, ds.decimals ?? 2) } },
      series: [{
        name: c.sub.name, type: 'line', symbol: 'circle', connectNulls: false,
        data: c.sub.points.map((v, i) => ({ value: v, itemStyle: { color: sf.has(i) ? p.hi : p.brand2 }, symbolSize: sf.has(i) ? 10 : 5 })),
        lineStyle: { color: p.brand2, width: 1.4 },
        markLine: { symbol: 'none', silent: true, label: { position: 'end', color: p.muted, formatter: (d) => `${d.name}\n${fmt(d.value, ds.decimals ?? 2)}` }, data: [
          { yAxis: c.sub.ucl, name: 'UCL', lineStyle: { color: p.hi, type: 'dashed' } },
          { yAxis: c.sub.center, name: 'CL', lineStyle: { color: p.lo } },
          ...(c.sub.lcl > 0 ? [{ yAxis: c.sub.lcl, name: 'LCL', lineStyle: { color: p.hi, type: 'dashed' } }] : []),
        ] },
      }],
    }, true);
  } else {
    $('subCard').hidden = true;
  }
}
function hexA(color, a) {
  // color may be #rrggbb or rgb(); return rgba with alpha a
  if (color.startsWith('#')) {
    const h = color.length === 4 ? color.slice(1).split('').map((x) => x + x).join('') : color.slice(1);
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return color.replace(/rgba?\(([^)]+)\)/, (_, v) => `rgba(${v.split(',').slice(0, 3).join(',')},${a})`);
}

// ---------- tab: overview ----------
function renderOverview() {
  const rows = [];
  const finds = [];
  for (const ds of state.datasets) {
    if (ds.kind === 'pareto') continue;
    const r = analyse(ds);
    const st = stabilityStory(ds, r);
    let capCell, ppmCell, verdictPill, next;
    if (ds.kind === 'attribute') {
      capCell = `<span class="score-big">${pct(r.chart.center)}</span><span class="sub">average defective</span>`;
      ppmCell = fmtPpm(r.chart.center * 1e6);
      verdictPill = r.chart.center > 0.05 ? '<span class="pill hi">High defect rate</span>' : '<span class="pill mid">Moderate</span>';
      next = st.ok ? 'Pareto the defect types' : 'Investigate the flagged periods, then Pareto the defect types';
    } else if (r.cap) {
      const v = S.verdict(r.cap.Cpk);
      capCell = `<span class="score-big">Cpk ${fmt(r.cap.Cpk)}</span><span class="sub">Ppk ${fmt(r.cap.Ppk)}</span>`;
      ppmCell = fmtPpm(r.cap.ppmOverall);
      verdictPill = `<span class="pill ${v.key}">${v.label}</span>`;
      next = !st.ok ? 'Remove special causes first' : r.cap.Cp != null && r.cap.Cp - r.cap.Cpk > 0.1 ? 'Re-centre the process' : 'Reduce variation';
    } else {
      capCell = '<span class="sub">no spec limits</span>'; ppmCell = '—'; verdictPill = '<span class="pill">n/a</span>'; next = 'Add spec limits';
    }
    rows.push(`<tr data-id="${ds.id}"><td><b>${esc(ds.short || ds.title)}</b>${ds.source === 'mine' ? ' <span class="src mine">your data</span>' : ''}<span class="sub">${esc(chartName(ds))}</span></td>
      <td><span class="pill ${st.ok ? 'lo' : 'hi'}">${st.ok ? '✓ Stable' : '⚠ ' + st.short}</span></td>
      <td>${capCell}</td><td class="num">${ppmCell}</td><td>${verdictPill}</td><td>${next} <span class="go">→</span></td></tr>`);
    if (finds.length < 4) {
      const lvl = !st.ok ? 'hi' : r.cap && r.cap.Cpk < 1.33 ? 'mid' : 'lo';
      const stab = st.ok ? 'Stable.' : `Not stable: ${st.events.map((e) => e.html).slice(0, 3).join('; ')}.`;
      const capTxt = ds.kind === 'attribute' ? ` Average ${pct(r.chart.center)} defective.`
        : r.cap ? ` Cpk ${fmt(r.cap.Cpk)} (${S.verdict(r.cap.Cpk).label.toLowerCase()}), about ${fmtPpm(r.cap.ppmOverall)} defects per million.` : '';
      finds.push(`<div class="find"><span class="ico ${lvl}">${lvl === 'hi' ? '⚠️' : lvl === 'mid' ? '🟠' : '✅'}</span><div><b>${esc(ds.short || ds.title)}</b><p>${stab}${capTxt}</p></div></div>`);
    }
  }
  const pds = state.datasets.find((d) => d.kind === 'pareto');
  if (pds) {
    const pr = analyse(pds).par;
    rows.push(`<tr data-id="${pds.id}"><td><b>${esc(pds.short || pds.title)}</b><span class="sub">Pareto</span></td><td>—</td>
      <td><span class="score-big">${pr.vitalCount} of ${pr.rows.length}</span><span class="sub">categories</span></td><td class="num">—</td>
      <td><span class="pill mid">${pr.vitalPct.toFixed(0)}% of ${esc(pds.unit)}</span></td><td>Fix the vital few first <span class="go">→</span></td></tr>`);
    finds.push(`<div class="find"><span class="ico mid">📊</span><div><b>${esc(pds.short)}</b><p>${esc(`Just ${pr.vitalCount} of ${pr.rows.length} categories (${pr.rows.slice(0, pr.vitalCount).map((r) => r.category).join(', ')}) cause ${pr.vitalPct.toFixed(0)}% of all ${pds.unit}.`)}</p></div></div>`);
    $('miniParetoTitle').textContent = pds.title;
    renderParetoChart('chMiniPareto', pds, pr, true);
    $('miniParetoNote').textContent = `Fixing the top ${pr.vitalCount} removes ${pr.vitalPct.toFixed(0)}% of the problem.`;
  }
  $('scorecard').innerHTML = `<thead><tr><th>Process</th><th>Stability</th><th>Capability</th><th class="num">Defects / million</th><th>Verdict</th><th>Next step</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  $('findings').innerHTML = finds.join('');
}
const stripTags = (h) => h.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '');
const shorten = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);
function chartName(ds) {
  return { individuals: 'I-MR chart', subgroups: `X̄-R chart (n = ${ds.groups?.[0]?.length})`, attribute: 'p chart', pareto: 'Pareto' }[ds.kind];
}

// ---------- tab: control ----------
function pickers(elId, filter, key, onPick) {
  const list = state.datasets.filter(filter);
  if (!list.some((d) => d.id === state.sel[key])) state.sel[key] = list[0]?.id;
  $(elId).innerHTML = list.map((d) => `<button role="radio" data-id="${d.id}" aria-checked="${d.id === state.sel[key]}">${esc(d.short || d.title)}${d.source === 'mine' ? ' ★' : ''}</button>`).join('');
  $(elId).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; state.sel[key] = b.dataset.id; onPick(); };
}
function renderControl() {
  pickers('ctlPick', (d) => d.kind !== 'pareto', 'control', renderControl);
  const ds = byId(state.sel.control);
  if (!ds) return;
  const r = analyse(ds), c = r.chart;
  $('ctlContext').textContent = ds.context || '';
  $('ctlTitle').innerHTML = `${esc(ds.title)} <small>${chartName(ds)}</small>`;
  $('ctlInsight').innerHTML = stabilityStory(ds, r).html;
  const isP = ds.kind === 'attribute';
  const f = (v) => valFmt(ds, v) + unitStr(ds);
  const total = new Set([...signalPoints(r), ...r.subSig.map((s) => s.i)]).size;
  $('ctlKpis').innerHTML = [
    ['Centre line', f(c.center), isP ? 'average proportion defective' : ds.kind === 'subgroups' ? 'grand mean (x̿)' : 'mean'],
    ['Upper control limit', isP ? 'varies' : f(c.ucl), isP ? `${pct(Math.min(...c.uclArr))} – ${pct(Math.max(...c.uclArr))}` : 'centre + 3σ'],
    ['Lower control limit', isP ? 'varies' : f(c.lcl), isP ? 'depends on sample size' : 'centre − 3σ'],
    [isP ? 'Total inspected' : 'σ within', isP ? S.sum(ds.sizes).toLocaleString() : fmt(c.sigmaWithin, (ds.decimals ?? 2) + 1) + unitStr(ds), isP ? `${S.sum(ds.defectives).toLocaleString()} defective` : ds.kind === 'subgroups' ? 'R̄ / d₂' : 'M̄R / 1.128'],
    ['Points flagged', `<span class="${total ? 'up' : 'down'}">${total}</span>`, `of ${c.points.length} ${ds.kind === 'subgroups' ? 'subgroups' : 'points'}`],
  ].map(([l, v, s]) => `<div class="kpi"><div class="k-label">${l}</div><div class="k-value">${v}</div><div class="k-sub">${s}</div></div>`).join('');
  renderControlChart(ds, r);
  const lib = lowerIsBetter(ds);
  const hint = (s, z) => {
    const better = lib !== null && z !== 0 && (z > 0) === !lib;
    if (better && s.rule === 5) return 'Steady improvement — find out what changed and make it standard.';
    if (better) return 'Better than usual — find out what went right and make it standard.';
    return {
      1: 'Something unusual happened here. Check what was different: people, machine, material, method, environment.',
      2: 'Early warning of a shift. Look for a change just before this point.',
      3: 'The average has probably moved. Look for a change just before this run.',
      4: 'Sustained shift: something changed and stayed changed (new staff, supplier, setting, procedure).',
      5: 'Steady drift: think wear, fatigue, build-up or a gradual change.',
    }[s.rule];
  };
  const rows = [...r.sig.map((s) => ({ ...s, chart: isP ? 'p' : ds.kind === 'subgroups' ? 'X̄' : 'I' })), ...r.subSig.map((s) => ({ ...s, chart: c.sub.name }))]
    .sort((a, b) => a.i - b.i);
  $('sigTable').innerHTML = rows.length
    ? `<thead><tr><th>When</th><th>Chart</th><th class="num">Value</th><th>Rule broken</th><th>What it may mean</th></tr></thead><tbody>${rows.map((s) => {
      const v = s.chart === c.sub?.name ? c.sub.points[s.i] : c.points[s.i];
      return `<tr><td><b>${esc(ds.labels[s.i])}</b></td><td>${s.chart}</td><td class="num">${s.chart === c.sub?.name ? fmt(v, ds.decimals ?? 2) : valFmt(ds, v)}</td><td class="rule">${s.rule}. ${S.RULES[s.rule]}</td><td class="rule">${s.chart === c.sub?.name ? hint({ rule: 1 }, 0) : hint(s, s.rule === 5 ? c.points[s.i] - c.points[Math.max(0, s.i - 5)] : r.z[s.i])}</td></tr>`;
    }).join('')}</tbody>`
    : '<tbody><tr><td class="empty">No signals — every point is inside the limits and no rule is broken. 🎉</td></tr></tbody>';
}

// ---------- tab: capability ----------
let simBase = null;
function renderCapability() {
  pickers('capPick', isVar, 'capability', () => { renderCapability(); });
  const ds = byId(state.sel.capability);
  if (!ds) { $('capInsight').innerHTML = 'Upload measurement data to calculate capability.'; return; }
  const r = analyse(ds);
  $('capContext').textContent = ds.context || '';
  for (const k of ['lsl', 'usl', 'target']) if (document.activeElement !== $(k)) $(k).value = Number.isFinite(ds[k]) ? ds[k] : '';
  $('capInsight').innerHTML = capabilityStory(ds, r);
  const c = r.cap;
  const kp = (l, v, s, cls = '') => `<div class="kpi"><div class="k-label">${l}</div><div class="k-value ${cls}">${v}</div><div class="k-sub">${s}</div></div>`;
  if (c) {
    const v = S.verdict(c.Cpk);
    $('capKpis').innerHTML = kp('Cp', fmt(c.Cp), 'potential (spread only)') + kp('Cpk', fmt(c.Cpk), `<span class="pill ${v.key}">${v.label}</span>`) + kp('Pp', fmt(c.Pp), 'overall spread') + kp('Ppk', fmt(c.Ppk), 'actual performance')
      + kp('Defects / million', fmtPpm(c.ppmOverall), `observed ${fmtPpm(c.ppmObserved)}`) + kp('Sigma level', fmt(c.sigmaLevel, 1) + 'σ', 'Z.bench + 1.5 shift');
  } else $('capKpis').innerHTML = '';
  renderHistogram(ds, r);
  renderNormality(ds, r);
  $('capTable').innerHTML = c ? '<tbody>' + [
    ['Sample size (n)', c.n], ['Mean', fmt(c.mean, (ds.decimals ?? 2) + 1)], ['σ within', fmt(c.sigmaWithin, 4)], ['σ overall', fmt(c.sigmaOverall, 4)],
    ['Cp', fmt(c.Cp)], ['Cpl / Cpu', `${fmt(c.Cpl)} / ${fmt(c.Cpu)}`], ['Cpk', fmt(c.Cpk)], ['Pp', fmt(c.Pp)], ['Ppl / Ppu', `${fmt(c.Ppl)} / ${fmt(c.Ppu)}`], ['Ppk', fmt(c.Ppk)],
    ['Cpm (Taguchi)', fmt(c.Cpm)], ['PPM within (expected)', fmtPpm(c.ppmWithin)], ['PPM overall (expected)', fmtPpm(c.ppmOverall)], ['PPM observed', fmtPpm(c.ppmObserved)],
    ['Z.bench within / overall', `${fmt(c.zBenchWithin)} / ${fmt(c.zBenchOverall)}`], ['Sigma level (with 1.5σ shift)', fmt(c.sigmaLevel)],
  ].map(([a, b]) => `<tr><td>${a}</td><td class="num">${b}</td></tr>`).join('') + '</tbody>' : '';
  // what-if
  const sim = $('sShift');
  if (c) {
    const range = Number.isFinite(c.lsl) && Number.isFinite(c.usl) ? (c.usl - c.lsl) / 2 : 3 * c.sigmaOverall;
    const step = Math.pow(10, -(ds.decimals ?? 2));
    if (simBase !== ds.id + r.key) { sim.min = -range; sim.max = range; sim.step = step; sim.value = 0; $('sVar').value = 0; simBase = ds.id + r.key; }
    $('btnCentre').disabled = !(Number.isFinite(c.lsl) && Number.isFinite(c.usl));
    updateSim(ds, r);
  }
  document.querySelectorAll('#panel-capability .compare, #panel-capability .sim-row').forEach((el) => { el.style.opacity = c ? 1 : 0.4; });
}
function updateSim(ds, r) {
  const c = r.cap; if (!c) return;
  const shift = +$('sShift').value, red = +$('sVar').value / 100;
  const d = ds.decimals ?? 2;
  $('oShift').textContent = (shift >= 0 ? '+' : '') + fmt(shift, d) + unitStr(ds) + ` → ${fmt(c.mean + shift, d)}`;
  $('oVar').textContent = Math.round(red * 100) + '%';
  const m = c.mean + shift, s = c.sigmaOverall * (1 - red);
  const has = Number.isFinite;
  const ppk = Math.min(...[has(c.usl) ? (c.usl - m) / (3 * s) : null, has(c.lsl) ? (m - c.lsl) / (3 * s) : null].filter((v) => v !== null));
  const ppm = ((has(c.lsl) ? S.normCdf((c.lsl - m) / s) : 0) + (has(c.usl) ? 1 - S.normCdf((c.usl - m) / s) : 0)) * 1e6;
  $('cpkNow').textContent = 'Ppk ' + fmt(c.Ppk); $('ppmNow').textContent = fmtPpm(c.ppmOverall) + ' defects / million';
  $('cpkNew').textContent = 'Ppk ' + fmt(ppk); $('ppmNew').textContent = fmtPpm(ppm) + ' defects / million';
  $('cpkNew').className = shift === 0 && red === 0 ? '' : ppk >= 1.33 ? 'down' : ppk < 1 ? 'up' : '';
  const saved = c.ppmOverall - ppm;
  $('simNote').innerHTML = shift === 0 && red === 0 ? 'Drag the sliders to see how re-centring or cutting variation changes capability.'
    : saved > 0 ? `That avoids about <b>${fmtPpm(saved)} defects per million</b> (${((saved / Math.max(c.ppmOverall, 1e-9)) * 100).toFixed(0)}% fewer) — sigma level ${fmt(c.sigmaLevel, 1)}σ → ${fmt(-S.normInv(ppm / 1e6) + 1.5, 1)}σ.`
    : `That would add about <b>${fmtPpm(-saved)} defects per million</b>.`;
}
function renderHistogram(ds, r) {
  const p = palette();
  const x = r.values;
  const specs = [ds.lsl, ds.usl, ds.target].filter(Number.isFinite);
  const h = S.histogram(x, specs);
  const m = S.mean(x), so = S.sd(x), sw = r.chart.sigmaWithin;
  const lo = Math.min(h.lo, m - 3.5 * so), hi = Math.max(h.hi, m + 3.5 * so);
  const curve = (s) => Array.from({ length: 121 }, (_, i) => { const v = lo + ((hi - lo) * i) / 120; return [v, S.normPdf(v, m, s) * x.length * h.width]; });
  const ml = [];
  if (Number.isFinite(ds.lsl)) ml.push({ xAxis: ds.lsl, name: 'LSL', lineStyle: { color: p.hi, width: 2 } });
  if (Number.isFinite(ds.usl)) ml.push({ xAxis: ds.usl, name: 'USL', lineStyle: { color: p.hi, width: 2 } });
  if (Number.isFinite(ds.target)) ml.push({ xAxis: ds.target, name: 'Target', lineStyle: { color: p.lo, width: 1.6, type: 'dashed' } });
  const d = ds.decimals ?? 2;
  chart('chHist').setOption({
    ...baseOpt(p), grid: { left: 44, right: 24, top: 40, bottom: 62 },
    tooltip: { trigger: 'item', backgroundColor: p.card, borderColor: p.line, textStyle: { color: p.ink }, formatter: (it) => it.seriesName === 'Data' ? `${fmt(it.value[0], d)} – ${fmt(it.value[1], d)}: <b>${it.value[2]}</b>` : it.seriesName },
    legend: { bottom: 0, textStyle: { color: p.muted }, data: ['Within', 'Overall'] },
    xAxis: { type: 'value', min: Math.min(lo, ...specs), max: Math.max(hi, ...specs), ...axisStyle(p), splitLine: { show: false }, axisLabel: { color: p.muted, hideOverlap: true, showMinLabel: false, showMaxLabel: false, formatter: (v) => fmt(v, Math.min(d, 2)) } },
    yAxis: { type: 'value', ...axisStyle(p) },
    series: [
      { name: 'Data', type: 'custom', data: h.bins.map((b) => [b.x0, b.x1, b.count]), encode: { x: [0, 1], y: 2 },
        renderItem: (params, api) => {
          const a = api.coord([api.value(0), api.value(2)]), b = api.coord([api.value(1), 0]);
          const outside = (Number.isFinite(ds.usl) && api.value(1) > ds.usl + 1e-9) || (Number.isFinite(ds.lsl) && api.value(0) < ds.lsl - 1e-9);
          return { type: 'rect', shape: { x: a[0] + 1, y: a[1], width: Math.max(1, b[0] - a[0] - 2), height: b[1] - a[1] }, style: { fill: hexA(outside ? p.hi : p.brand, 0.55) } };
        } },
      { name: 'Within', type: 'line', data: curve(sw), symbol: 'none', smooth: true, lineStyle: { color: p.brand2, type: 'dashed', width: 2 } },
      { name: 'Overall', type: 'line', data: curve(so), symbol: 'none', smooth: true, lineStyle: { color: p.brand, width: 2.2 },
        markLine: { symbol: 'none', silent: true, data: ml, label: { formatter: (q) => `${q.name}\n${fmt(q.value, d)}`, color: p.ink } } },
    ],
  }, true);
}
function renderNormality(ds, r) {
  const p = palette(), a = r.ad;
  const ok = a.p >= 0.05;
  $('normality').innerHTML = `<p class="note" style="font-size:14px;margin:0 0 6px">${ok ? '✅' : '⚠️'} A² = ${fmt(a.A2, 3)}, <b>p = ${a.p < 0.005 ? '< 0.005' : fmt(a.p, 3)}</b>. ${ok
    ? 'No evidence against normality — the defects-per-million estimates are reliable.'
    : 'The data are probably not normal, so treat the PPM estimates with caution (consider a transformation or a non-normal capability study).'}</p>`;
  const xs = [...r.values].sort((x, y) => x - y), n = xs.length, m = S.mean(xs), s = S.sd(xs);
  const pts = xs.map((v, i) => [S.normInv((i + 1 - 0.375) / (n + 0.25)), v]);
  chart('chQQ').setOption({
    ...baseOpt(p), grid: { left: 54, right: 20, top: 16, bottom: 40 },
    tooltip: { show: false },
    xAxis: { type: 'value', name: 'normal quantile', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: p.muted }, ...axisStyle(p) },
    yAxis: { type: 'value', scale: true, ...axisStyle(p), axisLabel: { color: p.muted, formatter: (v) => fmt(v, Math.min(ds.decimals ?? 2, 1)) } },
    series: [
      { type: 'scatter', data: pts, symbolSize: 5, itemStyle: { color: p.brand } },
      { type: 'line', data: [[-3, m - 3 * s], [3, m + 3 * s]], symbol: 'none', lineStyle: { color: p.hi, type: 'dashed' }, silent: true },
    ],
  }, true);
}

// ---------- tab: pareto ----------
function renderParetoChart(id, ds, pr, mini) {
  const p = palette();
  const cats = pr.rows.map((r) => r.category);
  chart(id).setOption({
    ...baseOpt(p), grid: { left: mini ? 70 : 80, right: 46, top: 24, bottom: mini ? 70 : 90 },
    tooltip: { ...baseOpt(p).tooltip, axisPointer: { type: 'shadow' }, formatter: (it) => { const r = pr.rows[it[0].dataIndex]; return `<b>${esc(r.category)}</b><br>${r.count.toLocaleString()} (${r.pct.toFixed(1)}%)<br>Cumulative ${r.cumPct.toFixed(1)}%`; } },
    xAxis: { type: 'category', data: cats, ...axisStyle(p), axisLabel: { color: p.muted, interval: 0, rotate: 30, width: 110, overflow: 'truncate', fontSize: mini ? 10 : 12 } },
    yAxis: [{ type: 'value', ...axisStyle(p) }, { type: 'value', min: 0, max: 100, axisLabel: { color: p.muted, formatter: '{value}%' }, splitLine: { show: false } }],
    series: [
      { type: 'bar', name: ds.unit, data: pr.rows.map((r) => ({ value: r.count, itemStyle: { color: r.vital ? p.brand : hexA(p.muted, 0.45), borderRadius: [4, 4, 0, 0] } })), barMaxWidth: 56 },
      { type: 'line', name: 'Cumulative %', yAxisIndex: 1, data: pr.rows.map((r) => +r.cumPct.toFixed(1)), symbol: 'circle', symbolSize: 6, lineStyle: { color: p.hi, width: 2 }, itemStyle: { color: p.hi },
        label: mini ? { show: false } : { show: true, position: 'top', formatter: '{c}%', color: p.muted, fontSize: 11 },
        markLine: { symbol: 'none', silent: true, data: [{ yAxis: 80, name: '80%' }], lineStyle: { color: p.mid, type: 'dashed' }, label: { show: false } } },
    ],
  }, true);
}
function renderPareto() {
  pickers('parPick', (d) => d.kind === 'pareto', 'pareto', renderPareto);
  const ds = byId(state.sel.pareto);
  if (!ds) return;
  const pr = analyse(ds).par;
  $('parContext').textContent = ds.context || '';
  $('parTitle').innerHTML = `${esc(ds.title)} <small>${pr.total.toLocaleString()} ${esc(ds.unit)} in total</small>`;
  const top = pr.rows.slice(0, pr.vitalCount).map((r) => `<b>${esc(r.category)}</b>`);
  $('parInsight').innerHTML = `🎯 <b>Focus on the vital few:</b> ${pr.vitalCount} of ${pr.rows.length} categories — ${top.join(', ')} — account for <b>${pr.vitalPct.toFixed(0)}%</b> of all ${esc(ds.unit)}. Solve these first; the remaining ${pr.rows.length - pr.vitalCount} together are only ${(100 - pr.vitalPct).toFixed(0)}%.`;
  renderParetoChart('chPareto', ds, pr, false);
  $('parTable').innerHTML = `<thead><tr><th>#</th><th>Category</th><th class="num">Count</th><th class="num">%</th><th class="num">Cumulative %</th><th></th></tr></thead><tbody>${pr.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.category)}</td><td class="num">${r.count.toLocaleString()}</td><td class="num">${r.pct.toFixed(1)}%</td><td class="num">${r.cumPct.toFixed(1)}%</td><td>${r.vital ? '<span class="pill hi">vital few</span>' : ''}</td></tr>`).join('')}</tbody>`;
}

// ---------- tab: method ----------
function renderMethod() {
  $('rulesList').innerHTML = Object.entries(S.RULES).map(([, t]) => `<li>${t}</li>`).join('');
  $('constTable').innerHTML = `<thead><tr><th>n</th><th>d₂</th><th>A₂</th><th>D₃</th><th>D₄</th></tr></thead><tbody>${Object.entries(S.CONST).map(([n, c]) => `<tr><td>${n}</td><td>${c.d2}</td><td>${c.A2}</td><td>${c.D3}</td><td>${c.D4}</td></tr>`).join('')}</tbody>`;
}

// ---------- tab: your data ----------
function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return null;
  const s = String(v).replace(/[,₱$\s]/g, '').replace(/%$/, '');
  if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  return Number(s);
}
const label = (v) => (v instanceof Date ? v.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : v == null ? '' : String(v));
let upload = null;
async function readFile(file) {
  const msg = (cls, html) => { $('mapper').innerHTML = `<div class="up-result ${cls}">${html}</div>`; };
  try {
    if (!window.XLSX) await new Promise((res, rej) => { let t = 0; const iv = setInterval(() => { if (window.XLSX) { clearInterval(iv); res(); } else if (++t > 100) { clearInterval(iv); rej(new Error('The Excel reader did not load — check your internet connection.')); } }, 100); });
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    let rows = [];
    for (const name of wb.SheetNames) {
      rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }).filter((r) => r.some((v) => v !== null && v !== ''));
      if (rows.length > 1) break;
    }
    if (rows.length < 2) throw new Error('No data found. The sheet needs a header row and at least one data row.');
    const width = Math.max(...rows.map((r) => r.length));
    const seen = {};
    const headers = Array.from({ length: width }, (_, i) => {
      let h = rows[0][i] == null || rows[0][i] === '' ? `Column ${i + 1}` : label(rows[0][i]).trim();
      if (seen[h]) h += ` (${++seen[h]})`; else seen[h] = 1;
      return h;
    });
    const data = rows.slice(1);
    const cols = headers.map((h, i) => {
      const vals = data.map((r) => r[i]).filter((v) => v !== null && v !== '');
      const nums = vals.map(num).filter((v) => v !== null);
      return { name: h, i, numeric: vals.length > 0 && nums.length / vals.length >= 0.8, filled: vals.length };
    });
    upload = { file: file.name.replace(/\.[^.]+$/, ''), headers, data, cols };
    renderMapper();
  } catch (e) {
    msg('err', `⚠️ <b>Could not read that file.</b> ${esc(e.message)}`);
  }
}
function guess() {
  const { cols } = upload;
  const find = (re, pred = () => true) => cols.find((c) => re.test(c.name) && pred(c));
  const numCols = cols.filter((c) => c.numeric && !/^(lsl|usl|lower spec|upper spec|target|nominal)/i.test(c.name));
  const textCols = cols.filter((c) => !c.numeric);
  const def = find(/defect|error|reject|fail|nonconform|wrong|bad/i, (c) => c.numeric);
  const size = find(/inspect|sample size|size|total|checked|audited|reviewed|received|processed|tested|collected|produced|^n$|count of/i, (c) => c.numeric && c !== def);
  const group = find(/hour|batch|lot|subgroup|shift|sample ?(no|#|id)?$|run/i);
  const lab = find(/date|day|week|month|time$|hour|batch|lot|period|order/i) || null;
  const isInt = (c) => upload.data.every((r) => { const v = num(r[c.i]); return v === null || Number.isInteger(v); });
  const cand = numCols.filter((c) => c !== group && c !== lab);
  const val = cand.find((c) => !isInt(c)) || cand[cand.length - 1] || numCols[0];
  const cat = find(/type|category|cause|reason|complaint|defect|issue|problem/i, (c) => !c.numeric) || textCols.find((c) => c !== lab);
  let type = 'meas';
  if (def && size) type = 'p';
  else if (!val || (cat && /type|category|cause|reason|complaint|defect|issue|problem/i.test(cat.name))) type = 'pareto';
  const cnt = find(/count|freq|qty|quantity|number|total|occurrence/i, (c) => c.numeric);
  let sub = 'none';
  if (group && group !== val) {
    const keys = upload.data.map((r) => r[group.i]);
    if (new Set(keys).size < keys.length * 0.8) sub = 'col:' + group.i;
  }
  // Spec limits written in the sheet (columns named LSL / USL / Target) are picked up automatically.
  const specOf = (re) => { const c = cols.find((k) => re.test(k.name)); if (!c) return ''; const v = upload.data.map((r) => num(r[c.i])).find((x) => x !== null); return v ?? ''; };
  return { type, val: val?.i, lab: lab?.i, def: def?.i, size: size?.i, cat: cat?.i, cnt: cnt?.i, sub,
    lsl: specOf(/^(lsl|lower spec)/i), usl: specOf(/^(usl|upper spec)/i), tgt: specOf(/^(target|nominal)/i) };
}
function renderMapper() {
  const g = guess();
  const opt = (filter, sel, blank) => (blank ? `<option value="">${blank}</option>` : '') + upload.cols.filter(filter).map((c) => `<option value="${c.i}" ${c.i === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const any = () => true, isNum = (c) => c.numeric;
  const subOpts = `<option value="none">None — one value per row (I-MR chart)</option>${[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<option value="size:${n}">Every ${n} consecutive rows (X̄-R)</option>`).join('')}${upload.cols.map((c) => `<option value="col:${c.i}" ${g.sub === 'col:' + c.i ? 'selected' : ''}>Group by column "${esc(c.name)}" (X̄-R)</option>`).join('')}`;
  $('mapper').innerHTML = `<div class="card up-card">
    <h3>📄 ${esc(upload.file)} <small>${upload.data.length.toLocaleString()} rows · ${upload.cols.length} columns</small></h3>
    <div class="map-form">
      <label>What do you want to analyse?
        <select id="mType">
          <option value="meas" ${g.type === 'meas' ? 'selected' : ''}>Measurements → control chart + capability</option>
          <option value="p" ${g.type === 'p' ? 'selected' : ''}>Defectives per sample → p chart</option>
          <option value="pareto" ${g.type === 'pareto' ? 'selected' : ''}>Categories → Pareto chart</option>
        </select></label>
      <label data-t="meas">Measurement column<select id="mVal">${opt(isNum, g.val)}</select></label>
      <label data-t="meas">Subgroups<select id="mSub">${subOpts}</select></label>
      <label data-t="meas p">Label column (optional)<select id="mLab">${opt(any, g.lab, '(row number)')}</select></label>
      <label data-t="meas">Lower spec (LSL)<input id="mLsl" type="number" step="any" placeholder="optional" value="${g.lsl}"></label>
      <label data-t="meas">Upper spec (USL)<input id="mUsl" type="number" step="any" placeholder="optional" value="${g.usl}"></label>
      <label data-t="meas">Target<input id="mTgt" type="number" step="any" placeholder="optional" value="${g.tgt}"></label>
      <label data-t="p">Number defective column<select id="mDef">${opt(isNum, g.def)}</select></label>
      <label data-t="p">Number inspected column<select id="mSize">${opt(isNum, g.size)}</select></label>
      <label data-t="pareto">Category column<select id="mCat">${opt(any, g.cat)}</select></label>
      <label data-t="pareto">Count column<select id="mCnt">${opt(isNum, g.cnt, '(count the rows)')}</select></label>
    </div>
    <div class="up-actions"><button class="btn primary" id="mGo">Analyse →</button></div>
    <div id="mMsg"></div></div>`;
  const sync = () => { const t = $('mType').value; document.querySelectorAll('.map-form [data-t]').forEach((el) => el.classList.toggle('hide', !el.dataset.t.split(' ').includes(t))); };
  $('mType').onchange = sync; sync();
  $('mGo').onclick = () => { try { buildFromUpload(); } catch (e) { $('mMsg').innerHTML = `<div class="up-result err" style="margin-top:12px">⚠️ ${esc(e.message)}</div>`; } };
}
function decimalsOf(vals) {
  let d = 0;
  for (const v of vals.slice(0, 200)) { const s = String(v); const k = s.includes('.') ? s.split('.')[1].length : 0; if (k > d) d = k; }
  return Math.min(d, 3);
}
function buildFromUpload() {
  const t = $('mType').value;
  const rows = upload.data;
  const labI = $('mLab').value === '' ? null : +$('mLab').value;
  const id = 'mine-' + Date.now();
  let ds;
  if (t === 'meas') {
    const vi = +$('mVal').value;
    const recs = rows.map((r, k) => ({ v: num(r[vi]), lab: labI === null ? `#${k + 1}` : label(r[labI]), row: r })).filter((x) => x.v !== null);
    if (recs.length < 5) throw new Error('Need at least 5 numeric values in the measurement column.');
    const sp = (x) => ($(x).value === '' ? null : +$(x).value);
    const lsl = sp('mLsl'), usl = sp('mUsl'), target = sp('mTgt');
    if (lsl !== null && usl !== null && lsl >= usl) throw new Error('The lower spec must be smaller than the upper spec.');
    const unitM = upload.headers[vi].match(/\(([^)]{1,12})\)\s*$/);
    const base = { id, source: 'mine', unit: unitM ? unitM[1] : '', decimals: decimalsOf(recs.map((x) => x.v)), lsl, usl, target, title: `${upload.file} — ${upload.headers[vi]}`, short: upload.headers[vi], context: `Your file "${upload.file}", column "${upload.headers[vi]}".` };
    const sub = $('mSub').value;
    let note = '';
    if (sub === 'none') ds = { ...base, kind: 'individuals', values: recs.map((x) => x.v), labels: recs.map((x) => x.lab) };
    else {
      let groups = [], labels = [];
      if (sub.startsWith('size:')) {
        const n = +sub.slice(5);
        const full = Math.floor(recs.length / n);
        if (full < 2) throw new Error(`Not enough rows for subgroups of ${n}.`);
        for (let g = 0; g < full; g++) { const part = recs.slice(g * n, g * n + n); groups.push(part.map((x) => x.v)); labels.push(labI === null ? `Subgroup ${g + 1}` : part[0].lab); }
        if (recs.length % n) note = ` (last ${recs.length % n} row(s) left out — not a full subgroup)`;
      } else {
        const gi = +sub.slice(4);
        const order = [], map = new Map();
        for (const x of recs) { const k = label(x.row[gi]); if (!map.has(k)) { map.set(k, []); order.push(k); } map.get(k).push(x.v); }
        groups = order.map((k) => map.get(k));
        labels = order.map((k) => (/^\d+$/.test(k) ? `${upload.headers[gi]} ${k}` : k));
        const sizes = [...new Set(groups.map((g) => g.length))];
        if (sizes.length > 1) {
          const n = Math.min(...groups.map((g) => g.length));
          if (n < 2) throw new Error('Some groups have only 1 value — X̄-R needs at least 2 per group. Try "None" (I-MR) instead.');
          groups = groups.map((g) => g.slice(0, n)); note = ` (groups had different sizes; used the first ${n} values of each)`;
        }
        if (groups[0].length > 10) throw new Error(`Groups have ${groups[0].length} values each — X̄-R supports up to 10. Try "None" (I-MR) instead.`);
      }
      ds = { ...base, kind: 'subgroups', groups, labels };
      base.context += note;
      ds.context = base.context;
    }
    state.datasets.push(ds);
    state.sel.control = id; state.sel.capability = id;
    done(ds, [['control', 'Control chart'], ['capability', 'Capability']], note);
  } else if (t === 'p') {
    const di = +$('mDef').value, si = +$('mSize').value;
    const recs = rows.map((r, k) => ({ d: num(r[di]), n: num(r[si]), lab: labI === null ? `#${k + 1}` : label(r[labI]) })).filter((x) => x.d !== null && x.n !== null && x.n > 0);
    if (recs.length < 5) throw new Error('Need at least 5 rows with both a defective count and a sample size.');
    if (recs.some((x) => x.d > x.n)) throw new Error('Some rows have more defectives than items inspected — check the two columns are the right way round.');
    ds = { id, source: 'mine', kind: 'attribute', unit: '%', decimals: 1, title: `${upload.file} — ${upload.headers[di]}`, short: upload.headers[di], context: `Your file "${upload.file}": "${upload.headers[di]}" out of "${upload.headers[si]}".`, defectives: recs.map((x) => x.d), sizes: recs.map((x) => x.n), labels: recs.map((x) => x.lab) };
    state.datasets.push(ds); state.sel.control = id;
    done(ds, [['control', 'p chart']]);
  } else {
    const ci = +$('mCat').value, ni = $('mCnt').value === '' ? null : +$('mCnt').value;
    const items = rows.map((r) => ({ category: label(r[ci]).trim(), count: ni === null ? 1 : num(r[ni]) })).filter((x) => x.category && x.count > 0);
    if (!items.length) throw new Error('No categories found in that column.');
    ds = { id, source: 'mine', kind: 'pareto', unit: ni === null ? 'entries' : upload.headers[ni].toLowerCase(), title: `${upload.file} — ${upload.headers[ci]}`, short: upload.headers[ci], context: `Your file "${upload.file}", column "${upload.headers[ci]}".`, items };
    state.datasets.push(ds); state.sel.pareto = id;
    done(ds, [['pareto', 'Pareto chart']]);
  }
}
function done(ds, links, note = '') {
  $('mMsg').innerHTML = `<div class="up-result ok" style="margin-top:12px">✓ <b>${esc(ds.title)}</b> analysed${esc(note)}. Open: ${links.map(([t, l]) => `<button class="link" data-go="${t}">${l} →</button>`).join(' ')}<br><span class="muted">It also appears on the Overview scorecard. Pick another column above to analyse more.</span></div>`;
  $('mMsg').querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => showTab(b.dataset.go)));
  showTab(links[0][0]);
}
function templates() {
  const defs = [
    ['I-MR (individual values)', 'SPC template - Individual values.xlsx', () => { const d = byId('tat'); return d.values.map((v, i) => ({ Date: d.labels[i] + ', 2026', 'Turnaround (min)': v, USL: i === 0 ? d.usl : null })); }],
    ['X̄-R (subgroups)', 'SPC template - Subgroups.xlsx', () => { const d = byId('fill'); return d.groups.flatMap((g, i) => g.map((v, k) => ({ Hour: i + 1, Bottle: k + 1, 'Volume (ml)': v, LSL: i + k === 0 ? d.lsl : null, USL: i + k === 0 ? d.usl : null, Target: i + k === 0 ? d.target : null }))); }],
    ['p chart (defectives)', 'SPC template - Defectives.xlsx', () => { const d = byId('docerr'); return d.sizes.map((n, i) => ({ Week: i + 1, 'Records audited': n, 'With errors': d.defectives[i] })); }],
    ['Pareto (categories)', 'SPC template - Pareto.xlsx', () => byId('pareto-doc').items.map((x) => ({ 'Error type': x.category, Count: x.count }))],
  ];
  $('templates').innerHTML = defs.map((d, i) => `<button class="btn" data-t="${i}">⬇ ${d[0]}</button>`).join('');
  $('templates').onclick = (e) => {
    const b = e.target.closest('[data-t]'); if (!b || !window.XLSX) return;
    const d = defs[+b.dataset.t];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d[2]()), 'Data'); XLSX.writeFile(wb, d[1]);
  };
}

// ---------- tabs, theme, events ----------
const renderers = { overview: renderOverview, control: renderControl, capability: renderCapability, pareto: renderPareto, method: renderMethod, data: () => {} };
function showTab(t) {
  if (!renderers[t]) t = 'overview';
  state.tab = t;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== 'panel-' + t; });
  if (location.hash !== '#' + t) history.replaceState(null, '', '#' + t);
  renderers[t]();
  requestAnimationFrame(() => Object.values(state.charts).forEach((c) => c.resize()));
}
document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) { showTab(b.dataset.tab); window.scrollTo({ top: 0 }); } });
$('scorecard').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]'); if (!tr) return;
  const ds = byId(tr.dataset.id);
  if (ds.kind === 'pareto') { state.sel.pareto = ds.id; showTab('pareto'); } else { state.sel.control = ds.id; showTab('control'); }
});
$('zones').addEventListener('change', renderControl);
for (const k of ['lsl', 'usl', 'target']) {
  $(k).addEventListener('input', () => {
    const ds = byId(state.sel.capability); if (!ds) return;
    const v = $(k).value === '' ? null : +$(k).value;
    const next = { lsl: ds.lsl, usl: ds.usl, target: ds.target, [k]: v };
    if (Number.isFinite(next.lsl) && Number.isFinite(next.usl) && next.lsl >= next.usl) return;
    ds[k] = v; renderCapability();
  });
}
$('sShift').addEventListener('input', () => { const ds = byId(state.sel.capability); updateSim(ds, analyse(ds)); });
$('sVar').addEventListener('input', () => { const ds = byId(state.sel.capability); updateSim(ds, analyse(ds)); });
$('btnCentre').addEventListener('click', () => {
  const ds = byId(state.sel.capability), c = analyse(ds).cap; if (!c) return;
  const goal = Number.isFinite(ds.target) ? ds.target : (ds.lsl + ds.usl) / 2;
  $('sShift').value = goal - c.mean; updateSim(ds, analyse(ds));
});
$('themeBtn').addEventListener('click', () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('spc-theme', t); } catch (e) {}
  Object.values(state.charts).forEach((c) => c.dispose()); state.charts = {};
  showTab(state.tab);
});
$('printBtn').addEventListener('click', () => window.print());
const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });
$('fileIn').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) readFile(f); });
window.addEventListener('resize', () => Object.values(state.charts).forEach((c) => c.resize()));
window.addEventListener('beforeprint', () => Object.values(state.charts).forEach((c) => c.resize()));

templates();
showTab(location.hash.slice(1) || 'overview');
