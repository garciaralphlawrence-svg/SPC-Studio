import json, numpy as np
from scipy import stats
o = json.load(open('test/out.json'))
ok = True
def chk(name, a, b, tol=1e-6):
    global ok
    good = abs(a-b) <= tol*max(1,abs(b))
    if not good: ok=False
    print(('OK  ' if good else 'FAIL'), name, round(a,6), round(b,6))
# I-MR
t=o['tat']; x=np.array(t['data']); mr=np.abs(np.diff(x)); mrb=mr.mean(); sw=mrb/1.128
chk('IMR CL',t['cl'],x.mean()); chk('IMR UCL',t['ucl'],x.mean()+3*sw); chk('IMR MR-bar',t['mrbar'],mrb); chk('MR UCL',t['mrucl'],3.267*mrb)
c=t['cap']; m=x.mean(); so=x.std(ddof=1)
chk('TAT Cpk (one-sided)',c['Cpk'],(55-m)/(3*sw)); chk('TAT Ppk',c['Ppk'],(55-m)/(3*so))
chk('TAT PPM overall',c['ppmOverall'],stats.norm.sf((55-m)/so)*1e6, 1e-5)
chk('TAT Z.bench overall',c['zBenchOverall'],stats.norm.isf(stats.norm.sf((55-m)/so)), 1e-5)
ad=stats.anderson(x,'norm'); chk('TAT Anderson-Darling A2',t['ad']['A2'],ad.statistic, 1e-4)
# Xbar-R
f=o['fill']; g=np.array(f['groups']); means=g.mean(1); R=g.max(1)-g.min(1); rb=R.mean()
chk('Xbar CL',f['cl'],means.mean()); chk('Xbar UCL',f['ucl'],means.mean()+0.577*rb); chk('Xbar LCL',f['lcl'],means.mean()-0.577*rb)
chk('R-bar',f['rbar'],rb); chk('R UCL',f['rucl'],2.114*rb); chk('sigma within',f['sw'],rb/2.326)
c=f['cap']; flat=g.ravel(); m=flat.mean(); so=flat.std(ddof=1); sw=rb/2.326
chk('Fill Cp',c['Cp'],6/(6*sw)); chk('Fill Cpk',c['Cpk'],min(503-m,m-497)/(3*sw)); chk('Fill Pp',c['Pp'],6/(6*so)); chk('Fill Ppk',c['Ppk'],min(503-m,m-497)/(3*so))
chk('Fill Cpm',c['Cpm'],6/(6*np.sqrt(so**2+(m-500)**2)))
chk('Fill PPM within',c['ppmWithin'],(stats.norm.cdf((497-m)/sw)+stats.norm.sf((503-m)/sw))*1e6, 1e-5)
chk('Fill PPM overall',c['ppmOverall'],(stats.norm.cdf((497-m)/so)+stats.norm.sf((503-m)/so))*1e6, 1e-5)
chk('Fill PPM observed',c['ppmObserved'],((flat<497)|(flat>503)).mean()*1e6)
ad=stats.anderson(flat,'norm'); chk('Fill Anderson-Darling A2',f['ad']['A2'],ad.statistic, 1e-4)
# p chart
p=o['docerr']; d=np.array(p['d']); n=np.array(p['n']); pb=d.sum()/n.sum()
chk('p-bar',p['pbar'],pb); s=np.sqrt(pb*(1-pb)/n)
for i in [0,16,25]: chk(f'p UCL wk{i+1}',p['ucl'][i],pb+3*s[i]); chk(f'p LCL wk{i+1}',p['lcl'][i],max(0,pb-3*s[i]))
# normal functions
for q,v in zip([0.001,0.5,0.975,0.99999],o['normInv']): chk(f'normInv({q})',v,stats.norm.ppf(q),1e-6)
for z,v in zip([-4,-1.5,0,2.5],o['normCdf']): chk(f'normCdf({z})',v,stats.norm.cdf(z),1e-6)
# Pareto
pr=o['pareto-doc']; chk('Pareto total',pr['total'],312); chk('Pareto vital-few %',pr['vitalPct'],258/312*100)
print('ALL PASSED' if ok else 'SOME FAILED')
