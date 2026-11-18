# SaaSDash

SaaS KPI dashboard for seed and Series A software companies. Connect Stripe or upload a CSV and get investor-grade SaaS metrics.

## Status
- [x] Metrics engine + tests (`src/lib/metrics`)
- [ ] Next.js app, Supabase schema and auth
- [ ] CSV upload flow
- [ ] Stripe ingest
- [ ] Dashboard
- [ ] Billing → paid beta
- [ ] v1.1: board-deck export

## Metrics engine
Pure TypeScript with no runtime dependencies. All money is integer cents.

`computeMetrics(mrrRows, cashRows?)` returns, per month:
- MRR, ARR, customers, ARPA
- MRR bridge: new, expansion, contraction, churned, reactivation, net new
- Logo churn %, gross MRR churn %
- Trailing-12 GRR and NRR (cohort = customers paying 12 months earlier)
- Runway (cash / avg net burn, last 3 months) and burn multiple (net burn / net new ARR)

It also returns cohort retention (revenue and logo) by first paying month.

`parseMrrCsv(text)` reads the upload template, `customer_id, month, mrr[, plan]`. It accepts `YYYY-MM`, `YYYY-MM-DD` and `M/D/YYYY` dates and `$1,250.00`-style amounts, and reports bad rows by line number.

Metric definitions live in the project spec (`claude/mvp-spec.md` in the SaaS KPI Dash project).

## Develop
```bash
npm install
npm test
npm run typecheck
```
