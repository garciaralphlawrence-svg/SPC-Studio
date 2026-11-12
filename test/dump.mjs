import * as S from '../js/stats.js';
import { buildDatasets } from '../js/data.js';
const ds = buildDatasets(); const out = {};
for (const d of ds) {
  if (d.kind==='individuals'){ const c=S.imr(d.values); out[d.id]={data:d.values, lsl:d.lsl, usl:d.usl, ucl:c.ucl,lcl:c.lcl,cl:c.center,mrbar:c.sub.center,mrucl:c.sub.ucl,sw:c.sigmaWithin, sig:S.signals(c), cap:S.capability(d.values,c.sigmaWithin,d.lsl,d.usl,d.target), ad:S.andersonDarling(d.values)}; }
  if (d.kind==='subgroups'){ const c=S.xbarR(d.groups); const flat=d.groups.flat(); out[d.id]={groups:d.groups,lsl:d.lsl,usl:d.usl,target:d.target,ucl:c.ucl,lcl:c.lcl,cl:c.center,rbar:c.sub.center,rucl:c.sub.ucl,sw:c.sigmaWithin,sig:S.signals(c),rsig:S.subSignals(c.sub),cap:S.capability(flat,c.sigmaWithin,d.lsl,d.usl,d.target),ad:S.andersonDarling(flat)}; }
  if (d.kind==='attribute'){ const c=S.pChart(d.defectives,d.sizes); out[d.id]={d:d.defectives,n:d.sizes,pbar:c.center,ucl:c.uclArr,lcl:c.lclArr,sig:S.signals(c)}; }
  if (d.kind==='pareto'){ out[d.id]=S.pareto(d.items); }
}
out.normInv=[0.001,0.5,0.975,0.99999].map(S.normInv); out.normCdf=[-4,-1.5,0,2.5].map(S.normCdf);
console.log(JSON.stringify(out));
