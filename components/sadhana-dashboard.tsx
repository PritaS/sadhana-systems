"use client";

import {
  useEffect,
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
  ReferenceLine,
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
// Deterministic mock data (seeded RNGs so SSR and client render identically).
// Each dataset gets its own RNG instance so adding or reordering a generator
// never shifts the numbers another chart already renders.
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

const SEED = 20260727;
const heatmapRng = mulberry32(SEED + 1);
const correlationRng = mulberry32(SEED + 2);
const frictionRng = mulberry32(SEED + 3);
const kriyaRng = mulberry32(SEED + 4);
const mantraRng = mulberry32(SEED + 5);

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

const DEFAULT_SPRINT_GOALS: SprintGoal[] = [
  { id: "g1", title: "Maintain 45m Morning Kriya", path: "raja", dayCurrent: 9, dayTarget: 14, progress: 71 },
  { id: "g2", title: "Read Gita Ch. 2–4, annotate weak verses", path: "jnana", dayCurrent: 9, dayTarget: 14, progress: 50 },
  { id: "g3", title: "Zero-complaint standups (Karma-yoga at work)", path: "karma", dayCurrent: 9, dayTarget: 14, progress: 86 },
  { id: "g4", title: "Evening Aarti, no phone in the room", path: "bhakti", dayCurrent: 9, dayTarget: 14, progress: 29 },
  { id: "g5", title: "Digital sunset by 9:30pm", path: "karma", dayCurrent: 9, dayTarget: 14, progress: 14 },
  { id: "g6", title: "Japa mala, 108 count, pre-dawn", path: "bhakti", dayCurrent: 9, dayTarget: 14, progress: 64 },
];

const SPRINT_STORAGE_KEY = "sadhana-sprint-progress-v1";

function loadSavedSprintProgress(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SPRINT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

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
    const daysFromToday = Math.round((today.getTime() - cursor.getTime()) / 86_400_000);
    // Keep the current 9-day sprint (mirrors the Sprint Board's "Day 9 of 14")
    // unbroken, so the streak stat never lands on an unlucky 0 on load.
    const miss = daysFromToday >= 9 && heatmapRng() < (isWeekend ? 0.12 : 0.2);
    const hours = miss ? 0 : Math.round((0.4 + heatmapRng() * (isWeekend ? 2.2 : 1.6)) * 10) / 10;
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
    const meditationHours = Math.round((0.25 + correlationRng() * 1.1) * 10) / 10;
    const noise = (correlationRng() - 0.5) * 2.2;
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

// --- Energy Leak & Friction Audit: gain vs. drain, last 7 days -------------

interface FrictionDay {
  day: string;
  gainHours: number;
  drainHours: number;
  net: number;
}

const DRAIN_HABITS = ["Mindless scrolling", "Reactive email", "Over-caffeination", "Doomscrolling news", "Unplanned venting"];
const GAIN_HABITS = ["Cold shower", "Gratitude note", "Walk without phone", "Box-breathing break", "Early lights-out"];

function generateFrictionAudit(): FrictionDay[] {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return labels.map((day) => {
    const gainHours = Math.round((0.3 + frictionRng() * 1.1) * 10) / 10;
    const drainHours = Math.round((0.2 + frictionRng() * 1.3) * 10) / 10;
    return { day, gainHours, drainHours, net: Math.round((gainHours - drainHours) * 10) / 10 };
  });
}

const frictionData = generateFrictionAudit();

function topTags(habits: string[], n = 3) {
  return habits
    .map((label) => ({ label, count: 1 + Math.floor(frictionRng() * 6) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

const topDrains = topTags(DRAIN_HABITS);
const topGains = topTags(GAIN_HABITS);

// --- Kriya & Breathwork Precision Log: quality over quantity, 14 days ------

type PostPracticeState = "Grounded" | "Expansive" | "Neutral" | "Agitated";

interface KriyaDay {
  date: Date;
  focus: number; // 1-5, internal focus / stillness
  anchored: boolean; // third-eye / energy awareness held
  state: PostPracticeState;
}

const STATE_COLOR: Record<PostPracticeState, string> = {
  Grounded: PALETTE.good,
  Expansive: PALETTE.clarity,
  Neutral: PALETTE.textMuted,
  Agitated: PALETTE.warning,
};

function generateKriyaLog(): KriyaDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: KriyaDay[] = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const focus = Math.min(5, Math.max(1, Math.round(2.6 + kriyaRng() * 2.4)));
    const anchored = kriyaRng() > 0.3;
    const state: PostPracticeState =
      focus >= 4 ? (kriyaRng() > 0.4 ? "Grounded" : "Expansive") : focus <= 2 ? "Agitated" : "Neutral";
    days.push({ date, focus, anchored, state });
  }
  return days;
}

const kriyaData = generateKriyaLog();

// --- Mantra & Bhakti Resonance Tracker --------------------------------------

interface MantraStat {
  name: string;
  count: number;
  resonance: number; // 1-5
}

const MANTRA_NAMES = [
  "Om Namah Shivaya",
  "Gayatri Mantra",
  "Maha Mrityunjaya",
  "Hanuman Chalisa",
  "Shiv Tandav Stotram",
  "So'ham",
];

function generateMantraStats(): MantraStat[] {
  return MANTRA_NAMES.map((name) => ({
    name,
    count: 2 + Math.floor(mantraRng() * 14),
    resonance: Math.round((3 + mantraRng() * 2) * 10) / 10,
  })).sort((a, b) => b.count - a.count);
}

const mantraStats = generateMantraStats();

// --- Gita Study & Insight Index: wisdom journal -----------------------------

interface JournalEntry {
  date: Date;
  verse: string;
  lesson: string;
  appliedIn: string;
  appliedUnderPressure: boolean;
}

const JOURNAL_SEED: Omit<JournalEntry, "date">[] = [
  {
    verse: "Gita 2.47",
    lesson: "You have a right to your actions, never to the fruits of those actions.",
    appliedIn: "Let go of outcome anxiety before the board review.",
    appliedUnderPressure: true,
  },
  {
    verse: "Gita 2.48",
    lesson: "Perform action established in balance, abandoning attachment to success and failure.",
    appliedIn: "Stayed even-keeled through a production incident.",
    appliedUnderPressure: true,
  },
  {
    verse: "Gita 3.19",
    lesson: "By working without attachment, one attains the ultimate.",
    appliedIn: "Shipped the release without needing credit for it.",
    appliedUnderPressure: false,
  },
  {
    verse: "Gita 6.5",
    lesson: "Elevate yourself through the self; do not degrade yourself.",
    appliedIn: "Caught a self-critical spiral mid-standup and reframed it.",
    appliedUnderPressure: true,
  },
  {
    verse: "Gita 2.14",
    lesson: "Contact between the senses and their objects gives rise to fleeting pleasure and pain — learn to tolerate them.",
    appliedIn: "Sat with frustration during a client escalation instead of reacting.",
    appliedUnderPressure: true,
  },
  {
    verse: "Gita 4.18",
    lesson: "One who sees inaction in action, and action in inaction, is wise among all.",
    appliedIn: "Noticed how much of the day's 'busy' work was really avoidance.",
    appliedUnderPressure: false,
  },
  {
    verse: "Gita 12.13",
    lesson: "Free from malice, friendly and compassionate toward all beings.",
    appliedIn: "Gave a hard piece of feedback without any edge in it.",
    appliedUnderPressure: true,
  },
];

function generateJournal(): JournalEntry[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return JOURNAL_SEED.map((entry, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    return { ...entry, date };
  });
}

const journalEntries = generateJournal();

// --- Glossary ----------------------------------------------------------------

const GLOSSARY: { group: string; terms: { term: string; definition: string }[] }[] = [
  {
    group: "The four paths",
    terms: [
      { term: "Karma Yoga", definition: "The path of selfless action — doing the work fully, without attachment to outcome or credit." },
      { term: "Raja Yoga", definition: "The path of meditation and mental discipline — stilling the mind through practices like Kriya and Pranayama." },
      { term: "Jnana Yoga", definition: "The path of wisdom and self-inquiry — study and direct insight into the nature of the self." },
      { term: "Bhakti Yoga", definition: "The path of devotion — mantra, japa, and ritual that orient the heart toward the sacred." },
      { term: "Sadhana", definition: "Consistent spiritual practice — the daily discipline that ties all four paths together." },
    ],
  },
  {
    group: "Practice terms",
    terms: [
      { term: "Kriya", definition: "A structured meditation or breath technique practiced to purify and focus the mind." },
      { term: "Pranayama", definition: "Breath-control practice used to regulate the nervous system and steady attention." },
      { term: "Japa", definition: "Repetitive recitation of a mantra, often counted on a mala of 108 beads." },
      { term: "Mantra", definition: "A sacred sound or phrase repeated to focus the mind and shift internal state." },
      { term: "Aarti", definition: "A devotional ritual of offering light, typically performed at dawn or dusk." },
      { term: "Bhagavad Gita", definition: "A core yogic text on duty, action, and self-realization, often studied verse by verse." },
    ],
  },
  {
    group: "Dashboard metrics",
    terms: [
      { term: "Energy flow budget", definition: "Your 112 waking hours per week, allocated across the four paths plus unallocated time." },
      { term: "Friction / unallocated", definition: "Waking hours not consciously routed to any practice — the dashboard's highest-leverage lever." },
      { term: "Sprint", definition: "A 14-day window of committed practice goals, tracked like an agile sprint." },
      { term: "Consistency streak", definition: "Consecutive days with at least some logged practice." },
      { term: "Pearson r", definition: "A correlation coefficient from -1 to 1 measuring how tightly two metrics move together; closer to 1 means a stronger positive relationship." },
      { term: "Resonance score", definition: "A 1–5 self-rating of how deeply a mantra or practice landed emotionally." },
      { term: "Net energy", definition: "Gain-habits minus drain-habits for a given day, in hours of vital energy preserved or lost." },
    ],
  },
];

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

function Chip({ label, count, tone }: { label: string; count?: number; tone: "gain" | "drain" }) {
  const color = tone === "gain" ? PALETTE.karma : PALETTE.critical;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
      style={{ borderColor: PALETTE.border, color: PALETTE.textSecondary, background: `${color}1a` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
      {count !== undefined && <span style={{ color: PALETTE.textMuted }}>×{count}</span>}
    </span>
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
  const [goals, setGoals] = useState<SprintGoal[]>(DEFAULT_SPRINT_GOALS);

  // Defaults render first so server and client markup match; the saved
  // override (if any) is applied after mount, client-only.
  useEffect(() => {
    const saved = loadSavedSprintProgress();
    if (Object.keys(saved).length === 0) return;
    setGoals((prev) => prev.map((g) => (g.id in saved ? { ...g, progress: saved[g.id] } : g)));
  }, []);

  function adjustProgress(id: string, delta: number) {
    setGoals((prev) => {
      const next = prev.map((g) =>
        g.id === id ? { ...g, progress: Math.min(100, Math.max(0, g.progress + delta)) } : g
      );
      try {
        const toSave: Record<string, number> = {};
        next.forEach((g) => {
          toSave[g.id] = g.progress;
        });
        window.localStorage.setItem(SPRINT_STORAGE_KEY, JSON.stringify(toSave));
      } catch {
        // localStorage unavailable (private browsing, disabled) — edits still work for this session
      }
      return next;
    });
  }

  return (
    <SectionCard title="Spiritual Sprint Board" subtitle={`Day ${goals[0].dayCurrent} of ${goals[0].dayTarget} · Agile Sadhana — click −/+ to log progress`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SPRINT_COLUMNS.map((col) => {
          const columnGoals = goals.filter((g) => columnFor(g) === col.key);
          return (
            <div key={col.key} className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: PALETTE.textMuted }}>
                {col.label} · {columnGoals.length}
              </p>
              <div className="space-y-2.5">
                {columnGoals.map((goal) => {
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
                          className="h-full rounded-full transition-[width]"
                          style={{ width: `${goal.progress}%`, backgroundColor: pathInfo.color }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px]" style={{ color: PALETTE.textMuted }}>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={`Decrease progress for ${goal.title}`}
                            onClick={() => adjustProgress(goal.id, -5)}
                            className="flex h-5 w-5 items-center justify-center rounded-full border text-xs leading-none"
                            style={{ borderColor: PALETTE.border, color: PALETTE.textSecondary }}
                          >
                            −
                          </button>
                          <span className="w-9 text-center text-xs font-medium" style={{ color: PALETTE.textPrimary }}>
                            {goal.progress}%
                          </span>
                          <button
                            type="button"
                            aria-label={`Increase progress for ${goal.title}`}
                            onClick={() => adjustProgress(goal.id, 5)}
                            className="flex h-5 w-5 items-center justify-center rounded-full border text-xs leading-none"
                            style={{ borderColor: PALETTE.border, color: PALETTE.textSecondary }}
                          >
                            +
                          </button>
                        </div>
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
// 5. Energy Leak & Friction Audit
// ---------------------------------------------------------------------------
//
// Net energy is a polarity metric (above/below zero), so it gets the
// diverging color job — not a categorical accent — per the same rule that
// keeps the Correlation Engine off a dual axis.

function DivergingBar(props: any) {
  const { x, y, width, height: rawHeight, payload } = props;
  const height = Math.max(0, rawHeight);
  const isPositive: boolean = payload.net >= 0;
  const color = isPositive ? PALETTE.karma : PALETTE.critical;
  const r = Math.max(0, Math.min(4, height, width / 2));
  const path = isPositive
    ? `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`
    : `M${x},${y} L${x + width},${y} L${x + width},${y + height - r} Q${x + width},${y + height} ${x + width - r},${y + height} L${x + r},${y + height} Q${x},${y + height} ${x},${y + height - r} Z`;
  return <path d={path} fill={color} />;
}

function frictionTooltip(props: any) {
  if (!props.active || !props.payload?.length) return null;
  const d: FrictionDay = props.payload[0].payload;
  return (
    <TooltipShell>
      <p style={{ color: PALETTE.textSecondary }}>{d.day}</p>
      <p className="mt-1 font-semibold" style={{ color: d.net >= 0 ? PALETTE.karma : PALETTE.critical }}>
        {d.net >= 0 ? "+" : ""}
        {d.net}h net
      </p>
      <p className="mt-0.5 text-[11px]" style={{ color: PALETTE.textMuted }}>
        +{d.gainHours}h gained · −{d.drainHours}h drained
      </p>
    </TooltipShell>
  );
}

function EnergyFrictionAudit() {
  const weeklyNet = Math.round(frictionData.reduce((s, d) => s + d.net, 0) * 10) / 10;
  return (
    <SectionCard
      title="Energy Leak & Friction Audit"
      subtitle="Evening check-in: unconscious habits that drain vital energy, against habits that preserve it."
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <LegendDot color={PALETTE.karma} label="Gain (net positive)" />
        <LegendDot color={PALETTE.critical} label="Drain (net negative)" />
        <span
          className="ml-auto text-xs font-medium"
          style={{ color: weeklyNet >= 0 ? PALETTE.karma : PALETTE.critical }}
        >
          {weeklyNet >= 0 ? "+" : ""}
          {weeklyNet}h net this week
        </span>
      </div>
      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={frictionData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={PALETTE.gridline} vertical={false} />
            <XAxis dataKey="day" tick={{ fill: PALETTE.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: PALETTE.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
            <ReferenceLine y={0} stroke={PALETTE.baseline} />
            <Tooltip content={frictionTooltip} cursor={false} />
            <Bar dataKey="net" shape={DivergingBar} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: PALETTE.textMuted }}>
            Top drains
          </p>
          <div className="flex flex-wrap gap-1.5">
            {topDrains.map((t) => (
              <Chip key={t.label} label={t.label} count={t.count} tone="drain" />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: PALETTE.textMuted }}>
            Top gains
          </p>
          <div className="flex flex-wrap gap-1.5">
            {topGains.map((t) => (
              <Chip key={t.label} label={t.label} count={t.count} tone="gain" />
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 6. Kriya & Breathwork Precision Log
// ---------------------------------------------------------------------------

function kriyaTooltip(props: any) {
  if (!props.active || !props.payload?.length) return null;
  const d: KriyaDay = props.payload[0].payload;
  return (
    <TooltipShell>
      <p style={{ color: PALETTE.textSecondary }}>
        {d.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
      </p>
      <p className="mt-1 font-semibold" style={{ color: PALETTE.textPrimary }}>
        Focus {d.focus}/5
      </p>
      <p className="mt-0.5 text-[11px]" style={{ color: STATE_COLOR[d.state] }}>
        {d.state}
        {d.anchored ? " · anchored inward" : ""}
      </p>
    </TooltipShell>
  );
}

function KriyaPrecisionLog() {
  const anchoredCount = kriyaData.filter((d) => d.anchored).length;
  const avgFocus = Math.round((kriyaData.reduce((s, d) => s + d.focus, 0) / kriyaData.length) * 10) / 10;
  const recent = kriyaData.slice(-7);
  return (
    <SectionCard
      title="Kriya & Breathwork Precision Log"
      subtitle="Depth of practice, not just duration — internal focus, third-eye anchoring, and post-practice state."
    >
      <div className="mb-3 flex gap-6">
        <div>
          <p className="text-[11px]" style={{ color: PALETTE.textMuted }}>Avg focus (14d)</p>
          <p className="text-lg font-semibold" style={{ color: PALETTE.textPrimary }}>{avgFocus}/5</p>
        </div>
        <div>
          <p className="text-[11px]" style={{ color: PALETTE.textMuted }}>Anchored inward</p>
          <p className="text-lg font-semibold" style={{ color: PALETTE.textPrimary }}>{anchoredCount}/14 days</p>
        </div>
      </div>
      <div style={{ height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={kriyaData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={PALETTE.gridline} vertical={false} />
            <XAxis
              dataKey={(d: KriyaDay) => d.date.getDate()}
              tick={{ fill: PALETTE.textMuted, fontSize: 11 }}
              axisLine={{ stroke: PALETTE.baseline }}
              tickLine={false}
              interval={1}
            />
            <YAxis domain={[1, 5]} ticks={[1, 3, 5]} width={20} tick={{ fill: PALETTE.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={kriyaTooltip} />
            <Line
              type="monotone"
              dataKey="focus"
              stroke={PALETTE.raja}
              strokeWidth={2}
              dot={{ r: 3, fill: PALETTE.raja, stroke: PALETTE.surface, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: PALETTE.raja, stroke: PALETTE.surface, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: PALETTE.textMuted }}>
        Post-practice state, last 7 days
      </p>
      <div className="flex flex-wrap gap-1.5">
        {recent.map((d, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]"
            style={{ borderColor: PALETTE.border, color: PALETTE.textSecondary }}
          >
            {d.date.toLocaleDateString("en-US", { weekday: "short" })}
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATE_COLOR[d.state] }} />
            {d.state}
          </span>
        ))}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 7. Mantra & Bhakti Resonance Tracker
// ---------------------------------------------------------------------------

function MantraResonanceTracker() {
  const maxCount = Math.max(...mantraStats.map((m) => m.count));
  return (
    <SectionCard
      title="Mantra & Bhakti Resonance Tracker"
      subtitle="Which japa, stotras, and bhajans carried the week — frequency and felt resonance, not just time spent."
    >
      <div className="space-y-3">
        {mantraStats.map((m) => (
          <div key={m.name}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
              <span style={{ color: PALETTE.textPrimary }}>{m.name}</span>
              <span style={{ color: PALETTE.textMuted }}>
                {m.count}× this week · resonance {m.resonance}/5
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: PALETTE.border }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${(m.count / maxCount) * 100}%`, backgroundColor: PALETTE.bhakti }}
              />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 8. Gita Study & Insight Index (Wisdom Journal)
// ---------------------------------------------------------------------------

function WisdomJournal() {
  const appliedCount = journalEntries.filter((e) => e.appliedUnderPressure).length;
  return (
    <SectionCard
      title="Gita Study & Insight Index"
      subtitle={`Wisdom journal — ${appliedCount}/${journalEntries.length} lessons applied under real pressure this week.`}
    >
      <div className="space-y-2.5">
        {journalEntries.map((e, i) => (
          <div key={i} className="rounded-xl border p-3" style={{ background: PALETTE.surfaceRaised, borderColor: PALETTE.border }}>
            <div className="flex items-center justify-between gap-2">
              <span
                className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                style={{ color: PALETTE.jnana, background: `${PALETTE.jnana}1a` }}
              >
                {e.verse}
              </span>
              <span className="text-[10px]" style={{ color: PALETTE.textMuted }}>
                {e.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-snug" style={{ color: PALETTE.textPrimary }}>{e.lesson}</p>
            <p className="mt-1.5 text-[11px] leading-snug" style={{ color: PALETTE.textSecondary }}>
              Applied: {e.appliedIn}
            </p>
            {e.appliedUnderPressure && (
              <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: PALETTE.good }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PALETTE.good }} />
                Applied under pressure
              </span>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Glossary panel
// ---------------------------------------------------------------------------

function GlossaryPanel() {
  return (
    <SectionCard title="Glossary" subtitle="Terms used across this dashboard.">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {GLOSSARY.map((section) => (
          <div key={section.group}>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide" style={{ color: PALETTE.textMuted }}>
              {section.group}
            </p>
            <dl className="space-y-2.5">
              {section.terms.map((t) => (
                <div key={t.term}>
                  <dt className="text-xs font-semibold" style={{ color: PALETTE.textPrimary }}>{t.term}</dt>
                  <dd className="mt-0.5 text-[11px] leading-relaxed" style={{ color: PALETTE.textSecondary }}>
                    {t.definition}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Dashboard shell
// ---------------------------------------------------------------------------

const TABS = [
  { key: "flow", label: "Daily Flow & Energy Allocation" },
  { key: "quality", label: "Sadhana Quality & Kriya Metrics" },
  { key: "wisdom", label: "Gita Study & Karma Integration" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function SadhanaDashboard() {
  const [tab, setTab] = useState<TabKey>("flow");
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  const totalPracticeHours = FLOW_HOURS.karma + FLOW_HOURS.raja + FLOW_HOURS.jnana + FLOW_HOURS.bhakti;
  const streak = currentStreak(heatmapData);
  const dominant = (Object.keys(PATHS) as PathKey[]).reduce((best, key) =>
    FLOW_HOURS[key] > FLOW_HOURS[best] ? key : best, "karma" as PathKey);

  return (
    <div className="min-h-screen w-full" style={{ background: PALETTE.pagePlane }}>
      <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest" style={{ color: PALETTE.textMuted }}>
              Sadhana Systems · Pro Mode
            </p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl" style={{ color: PALETTE.textPrimary }}>
              Weekly Practice Dashboard
            </h1>
            <p className="mt-1 text-sm" style={{ color: PALETTE.textSecondary }}>
              Systems-thinking applied to your four paths — Karma, Raja, Jnana, Bhakti.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGlossaryOpen((v) => !v)}
            className="rounded-full border px-3 py-1.5 text-xs font-medium"
            style={{
              borderColor: PALETTE.border,
              color: glossaryOpen ? PALETTE.textPrimary : PALETTE.textSecondary,
              background: glossaryOpen ? PALETTE.surfaceRaised : "transparent",
            }}
          >
            {glossaryOpen ? "Hide glossary" : "Glossary"}
          </button>
        </header>

        {glossaryOpen && <GlossaryPanel />}

        <nav className="flex flex-wrap gap-1 border-b" style={{ borderColor: PALETTE.border }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="border-b-2 px-3 py-2 text-xs font-medium"
              style={{
                borderColor: tab === t.key ? PALETTE.textPrimary : "transparent",
                color: tab === t.key ? PALETTE.textPrimary : PALETTE.textMuted,
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "flow" && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile label="Sadhana hours this week" value={`${totalPracticeHours}h`} delta="+4.2h vs last wk" />
              <StatTile
                label="Current streak"
                value={`${streak} days`}
                delta={streak >= 7 ? "Personal best" : streak > 0 ? "Building momentum" : "Restart today"}
                accent={streak > 0 ? undefined : PALETTE.warning}
              />
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
          </>
        )}

        {tab === "quality" && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <EnergyFrictionAudit />
            <KriyaPrecisionLog />
          </div>
        )}

        {tab === "wisdom" && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <MantraResonanceTracker />
            <WisdomJournal />
          </div>
        )}
      </div>
    </div>
  );
}
