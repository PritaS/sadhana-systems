"use client";

import {
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Layer,
  Line,
  LineChart,
  Rectangle,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ---------------------------------------------------------------------------
// Palette — dark, premium navy/slate ground with one fixed accent per path.
// Accent order follows a validated colorblind-safe categorical sequence;
// keep the order fixed rather than reassigning hues per render.
// ---------------------------------------------------------------------------

const PALETTE = {
  pagePlane: "#080b14",
  surface: "#10141f",
  surfaceRaised: "#141a2b",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.14)",
  textPrimary: "#f5f6f8",
  textSecondary: "#a8adba",
  textMuted: "#6b7080",
  gridline: "#1f2436",
  baseline: "#2e3550",
  karma: "#3987e5",
  raja: "#d95926",
  jnana: "#199e70",
  bhakti: "#c98500",
  clarity: "#d55181",
  friction: "#4b5169",
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#e66767",
} as const;

const PATHS = {
  karma: { label: "Karma · Action", color: PALETTE.karma },
  raja: { label: "Raja · Meditation", color: PALETTE.raja },
  jnana: { label: "Jnana · Wisdom", color: PALETTE.jnana },
  bhakti: { label: "Bhakti · Devotion", color: PALETTE.bhakti },
} as const;

type PathKey = keyof typeof PATHS;

// Dark-surface sequential blue ramp (near-surface -> peak luminance), reusing
// the documented sequential steps in reverse so "none" recedes into the card
// and "peak" pops against it.
const HEAT_STEPS = ["#141a2b", "#184f95", "#2a78d6", "#6da7ec", "#b7d3f6"];

// ---------------------------------------------------------------------------
// Deterministic mock data (seeded RNG so SSR and client render identically)
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260727);

// --- Energy Flow Analyzer: weekly 112-waking-hour budget -------------------

const FLOW_HOURS: Record<PathKey | "friction", number> = {
  karma: 48,
  raja: 8,
  jnana: 6,
  bhakti: 5,
  friction: 45,
};

const FLOW_SOURCE = "Weekly Energy Budget · 112h";

const sankeyData = {
  nodes: [
    { name: FLOW_SOURCE },
    { name: PATHS.karma.label },
    { name: PATHS.raja.label },
    { name: PATHS.jnana.label },
    { name: PATHS.bhakti.label },
    { name: "Unallocated / Friction" },
  ],
  links: [
    { source: 0, target: 1, value: FLOW_HOURS.karma },
    { source: 0, target: 2, value: FLOW_HOURS.raja },
    { source: 0, target: 3, value: FLOW_HOURS.jnana },
    { source: 0, target: 4, value: FLOW_HOURS.bhakti },
    { source: 0, target: 5, value: FLOW_HOURS.friction },
  ],
};

function flowColorForNode(name: string): string {
  if (name === PATHS.karma.label) return PALETTE.karma;
  if (name === PATHS.raja.label) return PALETTE.raja;
  if (name === PATHS.jnana.label) return PALETTE.jnana;
  if (name === PATHS.bhakti.label) return PALETTE.bhakti;
  if (name === "Unallocated / Friction") return PALETTE.friction;
  return PALETTE.textSecondary;
}

// --- Spiritual Sprint Board: 14-day sprint goals ----------------------------

interface SprintGoal {
  id: string;
  title: string;
  path: PathKey;
  dayCurrent: number;
  dayTarget: number;
  progress: number; // 0-100
}

const sprintGoals: SprintGoal[] = [
  { id: "g1", title: "Maintain 45m Morning Kriya", path: "raja", dayCurrent: 9, dayTarget: 14, progress: 71 },
  { id: "g2", title: "Read Gita Ch. 2–4, annotate weak verses", path: "jnana", dayCurrent: 9, dayTarget: 14, progress: 50 },
  { id: "g3", title: "Zero-complaint standups (Karma-yoga at work)", path: "karma", dayCurrent: 9, dayTarget: 14, progress: 86 },
  { id: "g4", title: "Evening Aarti, no phone in the room", path: "bhakti", dayCurrent: 9, dayTarget: 14, progress: 29 },
  { id: "g5", title: "Digital sunset by 9:30pm", path: "karma", dayCurrent: 9, dayTarget: 14, progress: 14 },
  { id: "g6", title: "Japa mala, 108 count, pre-dawn", path: "bhakti", dayCurrent: 9, dayTarget: 14, progress: 64 },
];

function sprintStatus(goal: SprintGoal): { label: string; color: string } {
  const expected = (goal.dayCurrent / goal.dayTarget) * 100;
  const delta = goal.progress - expected;
  if (delta >= 8) return { label: "Ahead of pace", color: PALETTE.good };
  if (delta <= -20) return { label: "Behind pace", color: PALETTE.critical };
  if (delta <= -8) return { label: "At risk", color: PALETTE.warning };
  return { label: "On pace", color: PATHS[goal.path].color };
}

// --- Consistency Heatmap: last ~3 months ------------------------------------

interface HeatDay {
  date: Date;
  hours: number;
}

function generateHeatmap(): HeatDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDays = 91;
  const start = new Date(today);
  start.setDate(today.getDate() - (totalDays - 1));
  const paddedStart = new Date(start);
  paddedStart.setDate(start.getDate() - start.getDay());

  const days: HeatDay[] = [];
  const cursor = new Date(paddedStart);
  while (cursor <= today) {
    const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;
    const miss = rng() < (isWeekend ? 0.12 : 0.2);
    const hours = miss ? 0 : Math.round((0.4 + rng() * (isWeekend ? 2.2 : 1.6)) * 10) / 10;
    days.push({ date: new Date(cursor), hours });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

const heatmapData = generateHeatmap();

function heatLevel(hours: number): number {
  if (hours <= 0) return 0;
  if (hours < 0.75) return 1;
  if (hours < 1.5) return 2;
  if (hours < 2.25) return 3;
  return 4;
}

function currentStreak(days: HeatDay[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].hours > 0) streak++;
    else break;
  }
  return streak;
}

// --- Correlation Engine: clarity vs. meditation depth, 30 days -------------

interface CorrelationDay {
  day: number;
  clarity: number;
  meditationHours: number;
}

function generateCorrelation(): CorrelationDay[] {
  const out: CorrelationDay[] = [];
  for (let day = 1; day <= 30; day++) {
    const meditationHours = Math.round((0.25 + rng() * 1.1) * 10) / 10;
    const noise = (rng() - 0.5) * 2.2;
    const clarity = Math.min(10, Math.max(1, Math.round(3.2 + meditationHours * 3.6 + noise)));
    out.push({ day, clarity, meditationHours });
  }
  return out;
}

const correlationData = generateCorrelation();

function pearsonR(rows: CorrelationDay[]): number {
  const n = rows.length;
  const mx = rows.reduce((s, r) => s + r.meditationHours, 0) / n;
  const my = rows.reduce((s, r) => s + r.clarity, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const r of rows) {
    num += (r.meditationHours - mx) * (r.clarity - my);
    dx += (r.meditationHours - mx) ** 2;
    dy += (r.clarity - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

const correlationR = pearsonR(correlationData);

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 sm:p-6 ${className}`}
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <div className="mb-4">
        <h2 className="text-sm font-semibold tracking-wide" style={{ color: PALETTE.textPrimary }}>
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-xs leading-relaxed" style={{ color: PALETTE.textMuted }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: PALETTE.textSecondary }}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function StatTile({
  label,
  value,
  delta,
  accent,
}: {
  label: string;
  value: string;
  delta?: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <p className="text-xs" style={{ color: PALETTE.textMuted }}>
        {label}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold" style={{ color: PALETTE.textPrimary }}>
          {value}
        </span>
        {delta && (
          <span className="text-xs font-medium" style={{ color: accent ?? PALETTE.good }}>
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

function TooltipShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{ background: PALETTE.surfaceRaised, borderColor: PALETTE.borderStrong }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Energy Flow Analyzer
// ---------------------------------------------------------------------------

function SankeyNode(props: any) {
  const { x, y, width, height, index, payload } = props;
  const color = flowColorForNode(payload.name);
  const isSource = payload.name === FLOW_SOURCE;
  const hours = FLOW_HOURS[
    (Object.keys(PATHS).find((k) => PATHS[k as PathKey].label === payload.name) as PathKey) ?? "friction"
  ];
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill={color} radius={2} />
      <text
        x={isSource ? x - 10 : x + width + 10}
        y={y + height / 2 - (isSource ? 0 : 6)}
        textAnchor={isSource ? "end" : "start"}
        dominantBaseline="middle"
        fontSize={12}
        fontWeight={isSource ? 600 : 500}
        fill={PALETTE.textPrimary}
      >
        {payload.name}
      </text>
      {!isSource && (
        <text
          x={x + width + 10}
          y={y + height / 2 + 10}
          textAnchor="start"
          dominantBaseline="middle"
          fontSize={11}
          fill={PALETTE.textMuted}
        >
          {hours}h / wk · {Math.round((hours / 112) * 100)}%
        </text>
      )}
    </Layer>
  );
}

function SankeyLink(props: any) {
  const { sourceX, sourceY, targetX, targetY, sourceControlX, targetControlX, linkWidth, index, payload } = props;
  const color = flowColorForNode(payload.target.name);
  const path = `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
  return (
    <path
      key={`link-${index}`}
      d={path}
      fill="none"
      stroke={color}
      strokeOpacity={0.32}
      strokeWidth={Math.max(linkWidth, 1)}
    />
  );
}

function FlowTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload;
  if (!entry?.target) return null;
  return (
    <TooltipShell>
      <p style={{ color: PALETTE.textSecondary }}>{entry.target.name}</p>
      <p className="mt-0.5 font-semibold" style={{ color: PALETTE.textPrimary }}>
        {entry.value}h this week
      </p>
    </TooltipShell>
  );
}

function EnergyFlowAnalyzer() {
  const frictionPct = Math.round((FLOW_HOURS.friction / 112) * 100);
  return (
    <SectionCard
      title="Energy Flow Analyzer"
      subtitle="112 waking hours this week, routed across the four paths."
    >
      <div style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyData}
            node={SankeyNode}
            link={SankeyLink}
            nodePadding={36}
            nodeWidth={10}
            margin={{ top: 12, bottom: 12, left: 12, right: 190 }}
          >
            <Tooltip content={<FlowTooltip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 rounded-lg border px-3 py-2 text-xs leading-relaxed" style={{ borderColor: PALETTE.border, color: PALETTE.textSecondary }}>
        <strong style={{ color: PALETTE.textPrimary }}>{frictionPct}% of the budget is unallocated.</strong>{" "}
        That&apos;s your highest-leverage capacity for next sprint — before adding a fifth practice, reclaim friction time.
      </p>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 2. Spiritual Sprint Board
// ---------------------------------------------------------------------------

const SPRINT_COLUMNS: { key: "behind" | "onpace" | "ahead"; label: string }[] = [
  { key: "behind", label: "Behind Pace" },
  { key: "onpace", label: "On Pace" },
  { key: "ahead", label: "Ahead of Pace" },
];

function columnFor(goal: SprintGoal): "behind" | "onpace" | "ahead" {
  const expected = (goal.dayCurrent / goal.dayTarget) * 100;
  const delta = goal.progress - expected;
  if (delta <= -8) return "behind";
  if (delta >= 8) return "ahead";
  return "onpace";
}

function SprintBoard() {
  return (
    <SectionCard title="Spiritual Sprint Board" subtitle={`Day ${sprintGoals[0].dayCurrent} of ${sprintGoals[0].dayTarget} · Agile Sadhana`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SPRINT_COLUMNS.map((col) => {
          const goals = sprintGoals.filter((g) => columnFor(g) === col.key);
          return (
            <div key={col.key} className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: PALETTE.textMuted }}>
                {col.label} · {goals.length}
              </p>
              <div className="space-y-2.5">
                {goals.map((goal) => {
                  const status = sprintStatus(goal);
                  const pathInfo = PATHS[goal.path];
                  return (
                    <div
                      key={goal.id}
                      className="rounded-xl border p-3"
                      style={{ background: PALETTE.surfaceRaised, borderColor: PALETTE.border }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <LegendDot color={pathInfo.color} label={pathInfo.label.split(" · ")[0]} />
                        <span className="text-[10px] font-medium" style={{ color: status.color }}>
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-snug" style={{ color: PALETTE.textPrimary }}>
                        {goal.title}
                      </p>
                      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: PALETTE.border }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${goal.progress}%`, backgroundColor: pathInfo.color }}
                        />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px]" style={{ color: PALETTE.textMuted }}>
                        <span>{goal.progress}%</span>
                        <span>Day {goal.dayCurrent}/{goal.dayTarget}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 3. Consistency Heatmap
// ---------------------------------------------------------------------------

function ConsistencyHeatmap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; day: HeatDay } | null>(null);

  const weeks = useMemo(() => {
    const cols: HeatDay[][] = [];
    for (let i = 0; i < heatmapData.length; i += 7) {
      cols.push(heatmapData.slice(i, i + 7));
    }
    return cols;
  }, []);

  const monthLabels = useMemo(() => {
    const labels: { index: number; text: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const first = week[0];
      const m = first.date.getMonth();
      if (m !== lastMonth) {
        labels.push({ index: i, text: first.date.toLocaleDateString("en-US", { month: "short" }) });
        lastMonth = m;
      }
    });
    return labels;
  }, [weeks]);

  function showTip(e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, day: HeatDay) {
    const rect = containerRef.current?.getBoundingClientRect();
    const target = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!rect) return;
    setTip({ x: target.left - rect.left + target.width / 2, y: target.top - rect.top, day });
  }

  return (
    <SectionCard title="Consistency Heatmap" subtitle="Daily practice intensity, last 3 months.">
      <div ref={containerRef} className="relative overflow-x-auto pb-2">
        {tip && (
          <div
            className="pointer-events-none absolute z-10"
            style={{ left: tip.x, top: tip.y, transform: "translate(-50%, -110%)" }}
          >
            <TooltipShell>
              <p style={{ color: PALETTE.textSecondary }}>
                {tip.day.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </p>
              <p className="mt-0.5 font-semibold" style={{ color: PALETTE.textPrimary }}>
                {tip.day.hours > 0 ? `${tip.day.hours}h practiced` : "No practice logged"}
              </p>
            </TooltipShell>
          </div>
        )}
        <div className="flex gap-1 pl-8 text-[10px]" style={{ color: PALETTE.textMuted }}>
          {weeks.map((_, i) => {
            const label = monthLabels.find((m) => m.index === i);
            return (
              <div key={i} className="w-[13px] shrink-0">
                {label?.text ?? ""}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1">
          <div className="flex w-7 shrink-0 flex-col justify-between text-[10px]" style={{ color: PALETTE.textMuted }}>
            <span>Mon</span>
            <span>Wed</span>
            <span>Fri</span>
          </div>
          <div className="flex gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((day, di) => (
                  <div
                    key={di}
                    tabIndex={0}
                    role="img"
                    aria-label={`${day.date.toDateString()}: ${day.hours} hours`}
                    onMouseEnter={(e) => showTip(e, day)}
                    onFocus={(e) => showTip(e, day)}
                    onMouseLeave={() => setTip(null)}
                    onBlur={() => setTip(null)}
                    className="h-[13px] w-[13px] rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-[#d55181]"
                    style={{ backgroundColor: HEAT_STEPS[heatLevel(day.hours)] }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 pl-8 text-[10px]" style={{ color: PALETTE.textMuted }}>
          <span>Less</span>
          {HEAT_STEPS.map((c, i) => (
            <span key={i} className="h-[11px] w-[11px] rounded-[3px]" style={{ backgroundColor: c }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 4. Correlation Engine
// ---------------------------------------------------------------------------
//
// A true dual-axis chart (Clarity 1-10 vs. Meditation hours 0-2) would force
// an arbitrary scale alignment that invents visual correlation. Instead this
// renders two single-axis panels sharing an x-axis via `syncId`, with one
// shared tooltip readout so both values are still visible at a glance.

function correlationTooltip(label: any) {
  const row = correlationData.find((r) => r.day === label);
  if (!row) return null;
  return (
    <TooltipShell>
      <p style={{ color: PALETTE.textSecondary }}>Day {row.day}</p>
      <p className="mt-1 flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PALETTE.clarity }} />
        <span className="font-semibold" style={{ color: PALETTE.textPrimary }}>{row.clarity}/10</span>
        <span style={{ color: PALETTE.textMuted }}>clarity</span>
      </p>
      <p className="mt-0.5 flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PALETTE.raja }} />
        <span className="font-semibold" style={{ color: PALETTE.textPrimary }}>{row.meditationHours}h</span>
        <span style={{ color: PALETTE.textMuted }}>meditation</span>
      </p>
    </TooltipShell>
  );
}

function CorrelationEngine() {
  const strength = Math.abs(correlationR) >= 0.7 ? "Strong" : Math.abs(correlationR) >= 0.4 ? "Moderate" : "Weak";
  return (
    <SectionCard
      title="Correlation Engine"
      subtitle="Daily clarity score against meditation depth, last 30 days."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
        <div className="flex flex-col justify-center gap-3">
          <div>
            <p className="text-xs" style={{ color: PALETTE.textMuted }}>Pearson r</p>
            <p className="text-3xl font-semibold" style={{ color: PALETTE.textPrimary }}>
              {correlationR.toFixed(2)}
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: PALETTE.textSecondary }}>
              {strength} positive correlation between meditation depth and reported clarity.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <LegendDot color={PALETTE.clarity} label="Clarity score (1–10)" />
            <LegendDot color={PALETTE.raja} label="Meditation hours" />
          </div>
        </div>

        <div className="space-y-1">
          <div style={{ height: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={correlationData} syncId="clarity-correlation" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={PALETTE.gridline} vertical={false} />
                <XAxis dataKey="day" tick={false} axisLine={{ stroke: PALETTE.baseline }} tickLine={false} />
                <YAxis
                  domain={[0, 10]}
                  ticks={[0, 5, 10]}
                  width={24}
                  tick={{ fill: PALETTE.textMuted, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={(props: any) => (props.active ? correlationTooltip(props.label) : null)} />
                <Line
                  type="monotone"
                  dataKey="clarity"
                  stroke={PALETTE.clarity}
                  strokeWidth={2}
                  dot={{ r: 3, fill: PALETTE.clarity, stroke: PALETTE.surface, strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: PALETTE.clarity, stroke: PALETTE.surface, strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="pl-1 text-[10px]" style={{ color: PALETTE.textMuted }}>Clarity / focus score</p>

          <div style={{ height: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={correlationData} syncId="clarity-correlation" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={PALETTE.gridline} vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: PALETTE.textMuted, fontSize: 11 }}
                  axisLine={{ stroke: PALETTE.baseline }}
                  tickLine={false}
                  interval={4}
                  tickFormatter={(d) => `Day ${d}`}
                />
                <YAxis
                  domain={[0, 2]}
                  ticks={[0, 1, 2]}
                  width={24}
                  tick={{ fill: PALETTE.textMuted, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={(props: any) => (props.active ? correlationTooltip(props.label) : null)} />
                <Bar dataKey="meditationHours" fill={PALETTE.raja} radius={[4, 4, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="pl-1 text-[10px]" style={{ color: PALETTE.textMuted }}>Meditation hours</p>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Dashboard shell
// ---------------------------------------------------------------------------

export default function SadhanaDashboard() {
  const totalPracticeHours = FLOW_HOURS.karma + FLOW_HOURS.raja + FLOW_HOURS.jnana + FLOW_HOURS.bhakti;
  const streak = currentStreak(heatmapData);
  const dominant = (Object.keys(PATHS) as PathKey[]).reduce((best, key) =>
    FLOW_HOURS[key] > FLOW_HOURS[best] ? key : best, "karma" as PathKey);

  return (
    <div className="min-h-screen w-full" style={{ background: PALETTE.pagePlane }}>
      <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        <header>
          <p className="text-xs font-medium uppercase tracking-widest" style={{ color: PALETTE.textMuted }}>
            Sadhana Systems · Pro Mode
          </p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl" style={{ color: PALETTE.textPrimary }}>
            Weekly Practice Dashboard
          </h1>
          <p className="mt-1 text-sm" style={{ color: PALETTE.textSecondary }}>
            Systems-thinking applied to your four paths — Karma, Raja, Jnana, Bhakti.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Sadhana hours this week" value={`${totalPracticeHours}h`} delta="+4.2h vs last wk" />
          <StatTile label="Current streak" value={`${streak} days`} delta="Personal best" />
          <StatTile
            label="Dominant path"
            value={PATHS[dominant].label.split(" · ")[0]}
            delta={`${Math.round((FLOW_HOURS[dominant] / totalPracticeHours) * 100)}% of practice`}
            accent={PATHS[dominant].color}
          />
          <StatTile
            label="Clarity ↔ meditation"
            value={`r = ${correlationR.toFixed(2)}`}
            delta={Math.abs(correlationR) >= 0.7 ? "Strong signal" : "Building signal"}
            accent={PALETTE.clarity}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <EnergyFlowAnalyzer />
          </div>
          <SprintBoard />
        </div>

        <ConsistencyHeatmap />
        <CorrelationEngine />
      </div>
    </div>
  );
}
