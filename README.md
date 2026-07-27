# Sadhana Systems — Pro Mode

Client-side dashboard applying engineering-leadership metrics to personal
spiritual practice: a weekly energy-flow budget across the four yoga paths,
a 14-day sprint board, a 3-month consistency heatmap, and a clarity ↔
meditation correlation engine.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Recharts

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

The dashboard is a single component at
[`components/sadhana-dashboard.tsx`](components/sadhana-dashboard.tsx), with
realistic mock data generated deterministically (seeded RNG) so it renders
fully populated on first load — no backend required.

## Notes

- The Correlation Engine deliberately avoids a true dual-axis chart (two
  differently-scaled y-axes on one plot invent a visual correlation that
  isn't really there). Instead it renders two single-axis panels sharing an
  x-axis via Recharts' `syncId`, with a shared tooltip and the computed
  Pearson r as the headline number.
- This scaffold was generated without a working Node.js install in the
  authoring environment, so `npm install` / `npm run build` have not been
  run against it yet — run both locally and fix anything that surfaces
  before shipping.
