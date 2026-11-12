# SPC Studio — Statistical Process Control in the browser

Live: https://garciaralphlawrence-svg.github.io/SPC-Studio/

Turns process data from Excel/CSV into:

- **Control charts**: I-MR, X̄-R (subgroups 2–10) and p charts (variable sample size), with Western Electric rules 1–4 plus a 6-point trend rule. Every signal is explained in plain English.
- **Process capability**: Cp, Cpk, Pp, Ppk, Cpm, expected/observed PPM, Z.bench and sigma level. One-sided specs are supported. Includes an improvement what-if: re-centre the process or cut variation.
- **Normality**: Anderson–Darling test (D'Agostino–Stephens adjustment) with a normal probability plot.
- **Pareto**: the vital few categories that make up about 80% of the problem.

Everything runs client-side (ECharts + SheetJS). Uploaded files never leave the browser. The demo data is synthetic.

## Verification
`node test/dump.mjs > test/out.json && python test/verify.py` cross-checks the statistics engine (`js/stats.js`) against NumPy/SciPy.

Built by Ralph Garcia.
