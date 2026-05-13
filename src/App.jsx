import { useState, useMemo, useEffect, useRef } from 'react';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts';

/* ════════════════════════════════════════════════════════════════════
   MIDI · Gemelo Digital Operativo  ·  Reto Opplus
   ──────────────────────────────────────────────────────────────────
   Pantalla de entrada (Landing)
     ├─ I.  Torre de Control   →  Perfil Director
     └─ II. Terminal NEXA       →  Perfil Gestor
   ════════════════════════════════════════════════════════════════════ */

const COLORS = {
  bg:        '#0a0a0d',
  surface:   '#13131a',
  surfaceHi: '#1b1b23',
  surfaceLo: '#0f0f15',
  border:    '#26262f',
  borderHi:  '#3a3a45',
  text:      '#ececea',
  textDim:   '#8a8a96',
  textMute:  '#54545f',
  amber:     '#f5b942',
  amberDim:  '#9c7426',
  sage:      '#7fb88a',
  sageDim:   '#4a6b50',
  sky:       '#6ec1e4',
  skyDim:    '#3e6e80',
  coral:     '#e87063',
  coralDim:  '#7a3f39',
  violet:    '#b78cf0',
};

const DEFAULT_PARAMS = {
  colaPasivaLimit:    300,
  capacityPerManager: 300,
  fastTrackPct:       20,
};

/* ── Realistic data pools ─────────────────────────────────────────── */

const FIRST_NAMES = [
  'Juan','María','Carlos','Ana','Laura','Pedro','Lucía','Javier','Sofía','Miguel',
  'Carmen','David','Elena','Antonio','Cristina','Pablo','Isabel','Sergio','Marta',
  'Alejandro','Patricia','Daniel','Beatriz','Roberto','Natalia','Fernando','Andrea',
  'Diego','Paula','Manuel','Raquel','Adrián','Silvia','Óscar','Mónica'
];
const LAST_NAMES = [
  'García','Rodríguez','González','Fernández','López','Martínez','Sánchez','Pérez',
  'Gómez','Martín','Jiménez','Ruiz','Hernández','Díaz','Moreno','Álvarez','Romero',
  'Alonso','Gutiérrez','Navarro','Torres','Domínguez','Vázquez','Ramos','Gil','Serrano',
  'Blanco','Molina','Suárez','Castro'
];
const PRODUCTS = [
  'Préstamo Personal','Tarjeta de Crédito','Hipoteca','Línea de Crédito',
  'Préstamo Coche','Microcrédito','Cuenta con Descubierto'
];
const STATES = [
  'Pendiente primer contacto','Promesa de pago pendiente','Negociación abierta',
  'Contactado sin acuerdo','En seguimiento','Documentación pendiente'
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pad  = (n, w) => String(n).padStart(w, '0');

/* ── Simulation Engine (sin cambios matemáticos) ─────────────────── */

function mkExpedient(id, day) {
  const fn  = pick(FIRST_NAMES);
  const ln1 = pick(LAST_NAMES);
  const ln2 = pick(LAST_NAMES);
  return {
    id,
    expCode:  `EXP-${pad(id, 7)}`,
    cliente:  `${fn} ${ln1} ${ln2}`,
    producto: pick(PRODUCTS),
    estado:   pick(STATES),
    I:  Math.random() * (50000 - 50) + 50,
    D:  Math.floor(Math.random() * 90) + 1,
    wP: Math.floor(Math.random() * 3) + 1,
    F:  Math.random() * 5,
    reactivation: Math.random() < 0.10,
    entryDay: day,
  };
}

function curveCD(D) {
  if (D < 1)   return null;
  if (D <= 15) return 1.2;
  if (D <= 45) return 1.0;
  if (D <= 60) return 1.0 + (D - 45) * 0.05;
  if (D <= 90) return 2.0;
  return null;
}

function calcSRS(e) {
  const c = curveCD(e.D);
  if (c === null) return -Infinity;
  return ((e.I * e.wP) / Math.log(Math.E + e.F)) * c;
}

function getTier(D) {
  if (D <= 30) return 1;
  if (D <= 60) return 2;
  return 3;
}

function stepDay(pool, day, idCounterRef, params, captureMgr1 = false) {
  const DAILY_INFLOW   = 12000;
  const PER_TIER       = 13;
  const CAP_PER_MGR    = params.capacityPerManager;
  const REACT_PER_MGR  = Math.floor(CAP_PER_MGR * params.fastTrackPct / 100);
  const COLA_PASIVA    = params.colaPasivaLimit;

  if (day > 1) {
    for (let i = 0; i < DAILY_INFLOW; i++) pool.push(mkExpedient(idCounterRef.v++, day));
  }

  const before = pool.length;
  pool = pool.filter(e => e.D <= 90);
  const discarded = before - pool.length;

  for (const e of pool) e.score = calcSRS(e);

  const cap   = { 1: PER_TIER * CAP_PER_MGR, 2: PER_TIER * CAP_PER_MGR, 3: PER_TIER * CAP_PER_MGR };
  const react = { 1: PER_TIER * REACT_PER_MGR, 2: PER_TIER * REACT_PER_MGR, 3: PER_TIER * REACT_PER_MGR };

  const resolved = new Set();
  const tierBreakdown = { 1: 0, 2: 0, 3: 0 };
  let fastTrack = 0, standard = 0, colaPasivaCnt = 0;
  let processedBefore60 = 0;

  const mgr1Queue = [];
  let mgr1React = 0;
  let mgr1Total = 0;

  // Step 1 — Fast-Track (reactivation)
  const ft = pool.filter(e => e.reactivation).sort((a,b) => b.score - a.score);
  for (const e of ft) {
    const t = getTier(e.D);
    if (react[t] > 0 && cap[t] > 0) {
      react[t]--; cap[t]--;
      resolved.add(e.id);
      tierBreakdown[t]++; fastTrack++;
      if (e.D < 60) processedBefore60++;
      if (captureMgr1 && t === 1 && mgr1React < REACT_PER_MGR) {
        mgr1Queue.push({ ...e, routing: 'fast-track' });
        mgr1React++; mgr1Total++;
      }
    }
  }

  // Step 2 — Cola Pasiva (lowest score)
  const restAfterFT = pool.filter(e => !resolved.has(e.id));
  const lowScore = [...restAfterFT].sort((a,b) => a.score - b.score);
  const cpIds = new Set();
  for (let i = 0; i < Math.min(COLA_PASIVA, lowScore.length); i++) {
    cpIds.add(lowScore[i].id);
    colaPasivaCnt++;
    if (lowScore[i].D < 60) processedBefore60++;
  }

  // Step 3 — Standard Pool (highest score by tier)
  const stdCandidates = pool
    .filter(e => !resolved.has(e.id) && !cpIds.has(e.id))
    .sort((a,b) => b.score - a.score);
  for (const e of stdCandidates) {
    const t = getTier(e.D);
    if (cap[t] > 0) {
      cap[t]--;
      resolved.add(e.id);
      tierBreakdown[t]++; standard++;
      if (e.D < 60) processedBefore60++;
      if (captureMgr1 && t === 1 && mgr1Total < CAP_PER_MGR) {
        mgr1Queue.push({ ...e, routing: 'standard' });
        mgr1Total++;
      }
    }
  }

  const next = pool
    .filter(e => !resolved.has(e.id) && !cpIds.has(e.id))
    .map(e => ({ ...e, D: e.D + 1 }));

  const usedCapacity  = (PER_TIER * CAP_PER_MGR * 3) - (cap[1] + cap[2] + cap[3]);
  const totalCapacity = PER_TIER * CAP_PER_MGR * 3;

  return {
    pool: next,
    metrics: {
      day, fastTrack, standard,
      colaPasiva: colaPasivaCnt,
      backlog: next.length,
      resolved: fastTrack + standard,
      processedBefore60,
      totalProcessed: fastTrack + standard + colaPasivaCnt,
      discarded, tierBreakdown,
      utilization: (usedCapacity / totalCapacity) * 100,
    },
    mgr1Queue,
  };
}

function computeInitialQueue(params) {
  const idCounterRef = { v: 0 };
  let pool = [];
  for (let i = 0; i < 12000; i++) pool.push(mkExpedient(idCounterRef.v++, 0));
  const { mgr1Queue } = stepDay(pool, 1, idCounterRef, params, true);
  const ft = mgr1Queue.filter(e => e.routing === 'fast-track').sort((a,b) => b.score - a.score);
  const st = mgr1Queue.filter(e => e.routing === 'standard').sort((a,b) => b.score - a.score);
  return [...ft, ...st].slice(0, 15);
}

/* ── Formatters ──────────────────────────────────────────────────── */

const fmtInt   = (n) => new Intl.NumberFormat('es-ES').format(Math.round(n));
const fmtMoney = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const fmtPct   = (n, d=1) => `${n.toFixed(d)}%`;

/* ── Inline SVG icons (geometric, no emojis) ─────────────────────── */

function IconChevronRight({ size=10, color='currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M3 1l4 4-4 4" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="square"/>
    </svg>
  );
}

function IconCheck({ size=20, color='currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ display: 'inline-block' }}>
      <path d="M4 10l4 4 8-8" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="square"/>
    </svg>
  );
}

function IconRefresh({ size=10, color='currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M2 6a4 4 0 016.93-2.7M10 6a4 4 0 01-6.93 2.7" stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="square"/>
      <path d="M9 1.5v2.7H6.3M3 10.5V7.8h2.7" stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="square"/>
    </svg>
  );
}

function IconArrowLeft({ size=10, color='currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M7 1L3 5l4 4" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="square"/>
    </svg>
  );
}

/* Priority diamond — used as a discreet leading marker on Fast-Track rows */
function PriorityMark({ size=8, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" style={{ display: 'inline-block' }}>
      <rect x="4" y="0" width="5.66" height="5.66" transform="rotate(45 4 0)" fill={color}/>
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════
   UI primitives (compartidas)
   ════════════════════════════════════════════════════════════════════ */

function StatusDot({ state }) {
  const c = { idle: COLORS.textMute, running: COLORS.amber, done: COLORS.sage }[state];
  return (
    <span className="relative flex h-2 w-2 mr-2">
      {state === 'running' && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: c }} />
      )}
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: c }} />
    </span>
  );
}

function ParamSlider({ label, value, min, max, step, onChange, unit, accent, hint }) {
  return (
    <div className="flex-1 min-w-[220px]">
      <div className="flex items-baseline justify-between mb-2">
        <span
          className="text-[10px] uppercase tracking-[0.22em]"
          style={{ color: COLORS.textDim, fontFamily: 'ui-monospace, monospace' }}
        >
          {label}
        </span>
        <span
          className="text-xl font-light tabular-nums"
          style={{ color: COLORS.text, fontFamily: 'ui-monospace, monospace' }}
        >
          {value}<span className="text-xs ml-1" style={{ color: accent }}>{unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: accent, cursor: 'pointer' }}
      />
      <div className="text-[10px] mt-1" style={{ color: COLORS.textMute }}>{hint}</div>
    </div>
  );
}

function BenefitBadge({ children, accent }) {
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-2 rounded-sm"
      style={{ background: COLORS.surfaceLo, border: `1px solid ${COLORS.border}` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
      <span
        className="text-[11px] uppercase tracking-[0.15em]"
        style={{ color: COLORS.text, fontFamily: 'ui-monospace, monospace' }}
      >
        {children}
      </span>
    </div>
  );
}

function KPICard({ label, value, sublabel, accent, hint, suffix='' }) {
  return (
    <div
      className="relative p-6 rounded-sm transition-all duration-300"
      style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
    >
      <div className="absolute top-0 left-0 h-px w-12" style={{ background: accent }} />
      <div
        className="text-[10px] uppercase tracking-[0.22em] mb-3"
        style={{ color: COLORS.textDim, fontFamily: 'ui-monospace, monospace' }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-5xl font-light tabular-nums tracking-tight"
          style={{ color: COLORS.text, fontFamily: 'ui-monospace, monospace' }}
        >
          {value}
        </span>
        <span className="text-xl" style={{ color: accent }}>{suffix}</span>
      </div>
      {sublabel && <div className="mt-2 text-sm" style={{ color: COLORS.textDim }}>{sublabel}</div>}
      {hint && (
        <div className="mt-4 text-[11px] leading-relaxed" style={{ color: COLORS.textMute }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function ChartFrame({ title, subtitle, accent, children }) {
  return (
    <div
      className="rounded-sm flex flex-col"
      style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
    >
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${COLORS.border}` }}
      >
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.22em] mb-1"
            style={{ color: COLORS.textDim, fontFamily: 'ui-monospace, monospace' }}
          >
            {title}
          </div>
          <div className="text-sm" style={{ color: COLORS.text }}>{subtitle}</div>
        </div>
        <div className="h-1 w-8" style={{ background: accent }} />
      </div>
      <div className="flex-1 p-4">{children}</div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="px-4 py-3 rounded-sm"
      style={{
        background: 'rgba(13,13,18,0.96)',
        border: `1px solid ${COLORS.borderHi}`,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: COLORS.textDim }}>
        Día {label}
      </div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-3 text-xs py-0.5">
          <span className="w-2 h-2" style={{ background: p.color, display: 'inline-block' }} />
          <span style={{ color: COLORS.textDim }}>{p.name}</span>
          <span className="ml-auto tabular-nums" style={{ color: COLORS.text }}>{fmtInt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function ContextItem({ label, value, unit }) {
  return (
    <div className="flex flex-col">
      <span
        className="text-[10px] uppercase tracking-[0.22em]"
        style={{ color: COLORS.textMute, fontFamily: 'ui-monospace, monospace' }}
      >
        {label}
      </span>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span
          className="text-2xl font-light tabular-nums"
          style={{ color: COLORS.text, fontFamily: 'ui-monospace, monospace' }}
        >
          {value}
        </span>
        <span className="text-xs" style={{ color: COLORS.textDim }}>{unit}</span>
      </div>
    </div>
  );
}

function FooterStat({ label, value, unit, accent }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="h-px w-3" style={{ background: accent }} />
        <span
          className="text-[10px] uppercase tracking-[0.22em]"
          style={{ color: COLORS.textDim, fontFamily: 'ui-monospace, monospace' }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="text-3xl font-light tabular-nums"
          style={{ color: COLORS.text, fontFamily: 'ui-monospace, monospace' }}
        >
          {value}
        </span>
        <span className="text-xs" style={{ color: COLORS.textDim }}>{unit}</span>
      </div>
    </div>
  );
}

function EmptyState({ message='Sin datos', sub='Ejecuta una simulación para visualizar la serie temporal.' }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center" style={{ color: COLORS.textMute }}>
      <div className="text-[10px] uppercase tracking-[0.3em] mb-2" style={{ fontFamily: 'ui-monospace, monospace' }}>
        {message}
      </div>
      <div className="text-xs" style={{ color: COLORS.textDim }}>{sub}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   LANDING SCREEN — pantalla de entrada
   ════════════════════════════════════════════════════════════════════ */

function RoleCard({ numeral, title, role, description, bullets, accent, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="text-left rounded-sm p-8 transition-all duration-300 relative overflow-hidden"
      style={{
        background: hover ? COLORS.surfaceHi : COLORS.surface,
        border: `1px solid ${hover ? accent : COLORS.border}`,
        boxShadow: hover ? `0 0 0 1px ${accent}33, 0 24px 48px -24px ${accent}44` : 'none',
        cursor: 'pointer',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <div
        className="absolute top-0 left-0 h-px transition-all duration-300"
        style={{
          width: hover ? '100%' : '48px',
          background: accent,
        }}
      />

      <div className="flex items-start gap-6 mb-8">
        <div
          className="text-6xl font-extralight leading-none tabular-nums"
          style={{
            color: accent,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            opacity: hover ? 1 : 0.85,
            transition: 'opacity 250ms',
          }}
        >
          {numeral}
        </div>
        <div className="flex-1 pt-1">
          <div
            className="text-[10px] uppercase tracking-[0.32em] mb-2"
            style={{ color: COLORS.textMute, fontFamily: 'ui-monospace, monospace' }}
          >
            {role}
          </div>
          <h2
            className="text-3xl font-light tracking-tight leading-tight"
            style={{ color: COLORS.text }}
          >
            {title}
          </h2>
        </div>
      </div>

      <p className="text-sm leading-relaxed mb-6" style={{ color: COLORS.textDim }}>
        {description}
      </p>

      <ul className="space-y-2 mb-8">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-3 text-[12px]" style={{ color: COLORS.text }}>
            <span
              className="mt-1.5 h-px w-3 flex-shrink-0"
              style={{ background: accent, opacity: 0.6 }}
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div
        className="flex items-center justify-between pt-5"
        style={{ borderTop: `1px solid ${COLORS.border}` }}
      >
        <span
          className="text-[10px] uppercase tracking-[0.3em]"
          style={{ color: COLORS.textMute, fontFamily: 'ui-monospace, monospace' }}
        >
          Acceder
        </span>
        <span
          className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em]"
          style={{
            color: hover ? accent : COLORS.textDim,
            fontFamily: 'ui-monospace, monospace',
            transition: 'color 200ms',
          }}
        >
          Entrar <IconChevronRight color={hover ? accent : COLORS.textDim} />
        </span>
      </div>
    </button>
  );
}

function LandingScreen({ onSelect }) {
  return (
    <div
      className="min-h-screen w-full relative"
      style={{
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* Atmospheric backdrop */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(245,185,66,0.06) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 50% 100%, rgba(110,193,228,0.04) 0%, transparent 60%)',
        }}
      />

      <div className="relative max-w-[1200px] mx-auto px-8 py-16 min-h-screen flex flex-col">

        {/* Top strip */}
        <div className="flex items-center justify-between mb-20">
          <div
            className="flex items-center gap-3 text-[10px] uppercase tracking-[0.32em]"
            style={{ color: COLORS.textDim, fontFamily: 'ui-monospace, monospace' }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLORS.amber }} />
            <span>Plataforma MIDI</span>
            <span style={{ color: COLORS.textMute }}>·</span>
            <span>Build 2026.05</span>
          </div>
          <div
            className="text-[10px] uppercase tracking-[0.32em]"
            style={{ color: COLORS.textMute, fontFamily: 'ui-monospace, monospace' }}
          >
            Reto Opplus · Producción
          </div>
        </div>

        {/* Wordmark */}
        <div className="text-center mb-4">
          <div
            className="text-[11px] uppercase tracking-[0.5em] mb-6"
            style={{ color: COLORS.textDim, fontFamily: 'ui-monospace, monospace' }}
          >
            Modelo de Inteligencia para la Distribución Inteligente
          </div>
          <h1
            className="text-7xl font-extralight tracking-tight leading-none"
            style={{ color: COLORS.text }}
          >
            MIDI <span style={{ color: COLORS.amber, fontWeight: 200 }}>·</span>{' '}
            <span style={{ color: COLORS.textDim, fontWeight: 200 }}>Gemelo Digital Operativo</span>
          </h1>
          <div
            className="mt-6 mx-auto h-px"
            style={{
              width: '120px',
              background: `linear-gradient(to right, transparent, ${COLORS.amber}, transparent)`,
            }}
          />
          <p
            className="max-w-2xl mx-auto mt-8 text-sm leading-relaxed"
            style={{ color: COLORS.textDim }}
          >
            Entorno de simulación operativa y herramienta de gestión de carteras de deuda bancaria.
            Distribución multicriterio asistida por <span style={{ color: COLORS.amber }}>Smart Recovery Score</span>{' '}
            sobre una capacidad instalada de 39 gestores en 3 tramos de especialización.
          </p>
        </div>

        {/* Section heading */}
        <div className="flex items-center gap-4 my-16">
          <span className="h-px flex-1" style={{ background: COLORS.border }} />
          <span
            className="text-[10px] uppercase tracking-[0.4em]"
            style={{ color: COLORS.textDim, fontFamily: 'ui-monospace, monospace' }}
          >
            Selecciona tu perfil de acceso
          </span>
          <span className="h-px flex-1" style={{ background: COLORS.border }} />
        </div>

        {/* Role cards */}
        <div className="grid grid-cols-2 gap-6 mb-20">
          <RoleCard
            numeral="I"
            role="Perfil Director"
            title="Torre de Control"
            accent={COLORS.amber}
            description="Simulación de escenarios sobre 30 días operativos, parametrización del motor de enrutamiento y evaluación de impacto cuantitativo y cualitativo del modelo."
            bullets={[
              'Parametrización en vivo de capacidad, fast-track y cola pasiva',
              'KPIs principales del Reto Opplus en 30 días simulados',
              'Cuantificación de horas-hombre y FTE liberados',
              'Gráficos de evolución temporal y reparto diario',
            ]}
            onClick={() => onSelect('director')}
          />
          <RoleCard
            numeral="II"
            role="Perfil Gestor"
            title="Terminal NEXA"
            accent={COLORS.violet}
            description="Bandeja de gestión priorizada por algoritmo, flujo de trabajo Lean con cero autoasignación y ejecución asistida en orden óptimo de recobro."
            bullets={[
              '15 expedientes priorizados según motor SRS',
              'Reactivaciones siempre al frente de la bandeja',
              'Sin filtros ni decisiones de orden por parte del gestor',
              'Estandarización del proceso de gestión al 100%',
            ]}
            onClick={() => onSelect('gestor')}
          />
        </div>

        {/* Footer */}
        <div
          className="mt-auto pt-8 flex items-center justify-between text-[10px] uppercase tracking-[0.28em]"
          style={{
            color: COLORS.textMute,
            borderTop: `1px solid ${COLORS.border}`,
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          <div className="flex items-center gap-6">
            <span>v 1.0.0</span>
            <span style={{ color: COLORS.border }}>|</span>
            <span>MIDI Engine</span>
            <span style={{ color: COLORS.border }}>|</span>
            <span>Reto Opplus 2026</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLORS.sage }} />
            <span>Sistema operativo</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ROLE CHROME — header común para vistas Director y Gestor
   ════════════════════════════════════════════════════════════════════ */

function RoleHeader({ children, onBack, status, statusLabel, currentDay, completed, role }) {
  return (
    <header className="mb-8">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 transition-colors duration-200"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: COLORS.textDim,
            fontFamily: 'ui-monospace, monospace',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.text; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.textDim; }}
        >
          <IconArrowLeft />
          <span className="text-[10px] uppercase tracking-[0.3em]">Inicio</span>
        </button>

        <div
          className="text-[10px] uppercase tracking-[0.3em] flex items-center"
          style={{ color: COLORS.textDim, fontFamily: 'ui-monospace, monospace' }}
        >
          <StatusDot state={status} />
          <span>{statusLabel}</span>
          <span className="mx-3" style={{ color: COLORS.textMute }}>·</span>
          <span>{role}</span>
        </div>
      </div>

      {children}
    </header>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TERMINAL NEXA — Gestor
   ════════════════════════════════════════════════════════════════════ */

function TierBadge({ tier }) {
  return (
    <span
      className="px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]"
      style={{
        color: COLORS.violet,
        border: `1px solid ${COLORS.violet}55`,
        background: `${COLORS.violet}10`,
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      Tramo {tier}
    </span>
  );
}

function FastTrackBadge() {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 text-[10px] uppercase tracking-[0.22em]"
      style={{
        color: COLORS.bg,
        background: COLORS.amber,
        fontFamily: 'ui-monospace, monospace',
        fontWeight: 600,
      }}
    >
      Fast-Track
    </span>
  );
}

function StandardBadge() {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 text-[10px] uppercase tracking-[0.22em]"
      style={{
        color: COLORS.sage,
        border: `1px solid ${COLORS.sageDim}`,
        background: `${COLORS.sage}10`,
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      Standard
    </span>
  );
}

function MicroMetric({ label, value, unit, highlight=false }) {
  return (
    <div>
      <div
        className="text-[9px] uppercase tracking-[0.22em] mb-1"
        style={{ color: COLORS.textMute, fontFamily: 'ui-monospace, monospace' }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className="text-xl font-light tabular-nums"
          style={{ color: highlight ? COLORS.amber : COLORS.text, fontFamily: 'ui-monospace, monospace' }}
        >
          {value}
        </span>
        {unit && <span className="text-xs" style={{ color: COLORS.textDim }}>{unit}</span>}
      </div>
    </div>
  );
}

function HeroCard({ exp, position, onGestionar }) {
  const isFT = exp.routing === 'fast-track';
  const accent = isFT ? COLORS.amber : COLORS.sage;
  return (
    <div
      className="relative rounded-sm overflow-hidden transition-all duration-300"
      style={{
        background: COLORS.surfaceHi,
        border: `1px solid ${accent}`,
        boxShadow: `0 0 0 1px ${accent}22, 0 20px 40px -20px ${accent}55`,
      }}
    >
      <div className="h-1" style={{ background: accent }} />

      <div className="p-7">
        <div className="flex items-center justify-between mb-5">
          <span
            className="text-[10px] uppercase tracking-[0.3em] flex items-center gap-2"
            style={{ color: accent, fontFamily: 'ui-monospace, monospace' }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent }} />
            Próxima acción · #{position}
          </span>
          <div className="flex items-center gap-2">
            {isFT ? <FastTrackBadge /> : <StandardBadge />}
            <TierBadge tier={getTier(exp.D)} />
          </div>
        </div>

        <div className="flex items-end justify-between gap-6 mb-6">
          <div>
            <div
              className="text-[10px] uppercase tracking-[0.22em] mb-1"
              style={{ color: COLORS.textMute, fontFamily: 'ui-monospace, monospace' }}
            >
              {exp.expCode}
            </div>
            <div className="text-3xl font-light tracking-tight" style={{ color: COLORS.text }}>
              {exp.cliente}
            </div>
            <div className="text-sm mt-1" style={{ color: COLORS.textDim }}>
              {exp.producto} · <span style={{ color: COLORS.textMute }}>{exp.estado}</span>
            </div>
          </div>
          <div className="text-right">
            <div
              className="text-[10px] uppercase tracking-[0.22em] mb-1"
              style={{ color: COLORS.textMute, fontFamily: 'ui-monospace, monospace' }}
            >
              Importe
            </div>
            <div
              className="text-3xl font-light tabular-nums"
              style={{ color: COLORS.text, fontFamily: 'ui-monospace, monospace' }}
            >
              {fmtMoney(exp.I)}
            </div>
          </div>
        </div>

        <div
          className="grid grid-cols-4 gap-4 py-4 mb-6"
          style={{ borderTop: `1px solid ${COLORS.border}`, borderBottom: `1px solid ${COLORS.border}` }}
        >
          <MicroMetric label="Días impago" value={exp.D} unit="d" />
          <MicroMetric label="Prioridad ωp" value={exp.wP} unit="/3" />
          <MicroMetric label="Fricción F" value={exp.F.toFixed(2)} unit="" />
          <MicroMetric label="Score SRS" value={fmtInt(exp.score)} unit="" highlight />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs" style={{ color: COLORS.textDim }}>
            <span style={{ color: COLORS.textMute }}>El sistema ha priorizado este expediente. </span>
            No tienes que decidir el orden, solo gestionar.
          </div>
          <button
            onClick={onGestionar}
            className="px-7 py-3 transition-all duration-150 rounded-sm flex items-center gap-2"
            style={{
              background: accent,
              color: COLORS.bg,
              fontFamily: 'ui-monospace, monospace',
              fontWeight: 600,
              letterSpacing: '0.18em',
              fontSize: 12,
              textTransform: 'uppercase',
              border: `1px solid ${accent}`,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            Gestionar <IconChevronRight color={COLORS.bg} />
          </button>
        </div>
      </div>
    </div>
  );
}

function QueueRow({ exp, position }) {
  const isFT = exp.routing === 'fast-track';
  const accent = isFT ? COLORS.amber : COLORS.sage;
  return (
    <div
      className="flex items-center gap-4 px-5 py-3 rounded-sm transition-all duration-150"
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `2px solid ${accent}`,
      }}
    >
      <span
        className="text-[10px] uppercase tracking-[0.22em] w-8"
        style={{ color: COLORS.textMute, fontFamily: 'ui-monospace, monospace' }}
      >
        #{position}
      </span>

      <span style={{ width: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {isFT && <PriorityMark color={COLORS.amber} />}
      </span>

      <div className="flex-1 min-w-0">
        <div className="text-sm truncate" style={{ color: COLORS.text }}>
          {exp.cliente}
        </div>
        <div className="text-[11px]" style={{ color: COLORS.textDim }}>
          {exp.producto} · {exp.expCode}
        </div>
      </div>

      <div className="text-right">
        <div className="text-sm tabular-nums" style={{ color: COLORS.text, fontFamily: 'ui-monospace, monospace' }}>
          {fmtMoney(exp.I)}
        </div>
        <div className="text-[10px]" style={{ color: COLORS.textDim }}>
          {exp.D}d · ωp {exp.wP}
        </div>
      </div>

      <div className="text-right w-20">
        <div
          className="text-[10px] uppercase tracking-[0.18em]"
          style={{ color: COLORS.textMute, fontFamily: 'ui-monospace, monospace' }}
        >
          SRS
        </div>
        <div className="text-sm tabular-nums" style={{ color: accent, fontFamily: 'ui-monospace, monospace' }}>
          {fmtInt(exp.score)}
        </div>
      </div>
    </div>
  );
}

function SessionStat({ label, value, accent, last=false }) {
  return (
    <div className="px-6 py-4" style={{ borderRight: last ? 'none' : `1px solid ${COLORS.border}` }}>
      <div
        className="text-[10px] uppercase tracking-[0.22em] mb-1"
        style={{ color: COLORS.textMute, fontFamily: 'ui-monospace, monospace' }}
      >
        {label}
      </div>
      <div
        className="text-2xl font-light tabular-nums"
        style={{ color: accent, fontFamily: 'ui-monospace, monospace' }}
      >
        {value}
      </div>
    </div>
  );
}

function GestorView({ onBack, queue, onGestionar, onReload, completed, status, statusLabel }) {
  const total  = queue.length + completed;
  const hero   = queue[0];
  const rest   = queue.slice(1);

  const ftCount  = queue.filter(e => e.routing === 'fast-track').length;
  const stdCount = queue.filter(e => e.routing === 'standard').length;

  const now = new Date();
  const hh = pad(now.getHours(), 2);
  const mm = pad(now.getMinutes(), 2);

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at top, rgba(183,140,240,0.04) 0%, transparent 50%)',
        }}
      />

      <div className="relative max-w-[1200px] mx-auto px-8 py-10">

        <RoleHeader
          onBack={onBack}
          status={status}
          statusLabel={statusLabel}
          role="Terminal NEXA"
        >
          <div>
            <h1
              className="text-4xl font-extralight tracking-tight leading-none mb-2"
              style={{ color: COLORS.text }}
            >
              Terminal NEXA <span style={{ color: COLORS.violet, fontWeight: 200 }}>·</span>{' '}
              <span style={{ color: COLORS.textDim, fontWeight: 200 }}>Gestión de cartera</span>
            </h1>
            <p className="text-sm" style={{ color: COLORS.textDim }}>
              Bandeja diaria priorizada por el motor MIDI · ejecuta los expedientes en el orden propuesto.
            </p>
          </div>
        </RoleHeader>

        {/* Gestor identity strip */}
        <div
          className="rounded-sm mb-6 overflow-hidden"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
        >
          <div className="px-6 py-5 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-5">
              <div
                className="flex items-center justify-center w-12 h-12 rounded-full text-base"
                style={{
                  background: COLORS.surfaceHi,
                  border: `1px solid ${COLORS.violet}66`,
                  color: COLORS.violet,
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                CM
              </div>
              <div>
                <div
                  className="text-[10px] uppercase tracking-[0.3em] mb-1"
                  style={{ color: COLORS.textDim, fontFamily: 'ui-monospace, monospace' }}
                >
                  Sesión activa
                </div>
                <div className="text-xl font-light" style={{ color: COLORS.text }}>
                  Carlos M. <span style={{ color: COLORS.textDim, fontWeight: 200 }}>· Gestor de Cartera</span>
                </div>
                <div className="text-xs mt-0.5" style={{ color: COLORS.textDim }}>
                  Especialidad <span style={{ color: COLORS.violet }}>Tramo 1</span> · expedientes de 1 a 30 días
                </div>
              </div>
            </div>

            <div className="flex items-center gap-8">
              <div className="text-right">
                <div
                  className="text-[10px] uppercase tracking-[0.22em]"
                  style={{ color: COLORS.textMute, fontFamily: 'ui-monospace, monospace' }}
                >
                  Sesión
                </div>
                <div className="text-sm" style={{ color: COLORS.text, fontFamily: 'ui-monospace, monospace' }}>
                  {hh}:{mm} · Día 1
                </div>
              </div>
              <button
                onClick={onReload}
                className="px-4 py-2 text-[10px] uppercase tracking-[0.22em] rounded-sm transition-colors flex items-center gap-2"
                style={{
                  background: 'transparent',
                  color: COLORS.textDim,
                  border: `1px solid ${COLORS.border}`,
                  cursor: 'pointer',
                  fontFamily: 'ui-monospace, monospace',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.text; e.currentTarget.style.borderColor = COLORS.borderHi; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.textDim; e.currentTarget.style.borderColor = COLORS.border; }}
              >
                <IconRefresh />
                Refrescar cola
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4" style={{ borderTop: `1px solid ${COLORS.border}` }}>
            <SessionStat label="Asignados (vista)" value={total}     accent={COLORS.text} />
            <SessionStat label="Gestionados"       value={completed} accent={COLORS.sage} />
            <SessionStat label="Fast-Track pend."  value={ftCount}   accent={COLORS.amber} />
            <SessionStat label="Standard pend."    value={stdCount}  accent={COLORS.sage} last />
          </div>
        </div>

        <div className="flex items-center gap-3 mb-5 px-1">
          <span
            className="text-[10px] uppercase tracking-[0.3em]"
            style={{ color: COLORS.textDim, fontFamily: 'ui-monospace, monospace' }}
          >
            Bandeja priorizada
          </span>
          <span className="h-px flex-1" style={{ background: COLORS.border }} />
          <span className="text-[11px]" style={{ color: COLORS.textMute }}>
            Orden definido por motor SRS · Reactivaciones primero
          </span>
        </div>

        {hero ? (
          <>
            <div className="mb-3">
              <HeroCard exp={hero} position={1} onGestionar={onGestionar} />
            </div>
            <div className="space-y-2">
              {rest.map((e, idx) => (
                <QueueRow key={e.id} exp={e} position={idx + 2} />
              ))}
            </div>
          </>
        ) : (
          <div
            className="rounded-sm p-12 text-center"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <div className="mb-4 flex items-center justify-center">
              <div
                className="flex items-center justify-center w-14 h-14 rounded-full"
                style={{ border: `1px solid ${COLORS.sage}`, background: `${COLORS.sage}10` }}
              >
                <IconCheck color={COLORS.sage} />
              </div>
            </div>
            <div className="text-xl font-light mb-2" style={{ color: COLORS.text }}>
              Bandeja gestionada
            </div>
            <div className="text-sm mb-6" style={{ color: COLORS.textDim }}>
              Has procesado los 15 expedientes priorizados para esta sesión.
            </div>
            <button
              onClick={onReload}
              className="px-5 py-2.5 rounded-sm transition-colors"
              style={{
                background: COLORS.amber,
                color: COLORS.bg,
                fontFamily: 'ui-monospace, monospace',
                fontSize: 11,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${COLORS.amber}`,
              }}
            >
              Cargar siguiente lote
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DIRECTOR VIEW — Torre de Control
   ════════════════════════════════════════════════════════════════════ */

function ImpactBlock({ label, value, unit, accent, detail }) {
  return (
    <div>
      <div
        className="text-[10px] uppercase tracking-[0.22em] mb-2"
        style={{ color: COLORS.textMute, fontFamily: 'ui-monospace, monospace' }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-4xl font-light tabular-nums tracking-tight"
          style={{ color: COLORS.text, fontFamily: 'ui-monospace, monospace' }}
        >
          {value}
        </span>
        <span className="text-base" style={{ color: accent }}>{unit}</span>
      </div>
      <div className="text-[11px] mt-1" style={{ color: COLORS.textDim }}>{detail}</div>
    </div>
  );
}

function DirectorView({ onBack, status, statusLabel, running, completed, runSimulation,
                        params, setParams, data, kpis, impact, totals }) {
  const set = (k) => (v) => setParams(p => ({ ...p, [k]: v }));
  const resetParams = () => setParams({ ...DEFAULT_PARAMS });

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at top, rgba(245,185,66,0.04) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(110,193,228,0.03) 0%, transparent 50%)',
        }}
      />

      <div className="relative max-w-[1400px] mx-auto px-8 py-10">

        <RoleHeader
          onBack={onBack}
          status={status}
          statusLabel={statusLabel}
          role="Torre de Control"
        >
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <h1
                className="text-4xl font-extralight tracking-tight leading-none mb-2"
                style={{ color: COLORS.text }}
              >
                Torre de Control <span style={{ color: COLORS.amber, fontWeight: 200 }}>·</span>{' '}
                <span style={{ color: COLORS.textDim, fontWeight: 200 }}>Simulación de 30 días</span>
              </h1>
              <p className="text-sm max-w-2xl" style={{ color: COLORS.textDim }}>
                Parametriza el modelo de enrutamiento y ejecuta el gemelo digital. Los KPIs se
                actualizan día a día durante la simulación.
              </p>
            </div>

            <button
              onClick={runSimulation}
              disabled={running}
              className="px-6 py-3 transition-all duration-200 rounded-sm"
              style={{
                background: running ? COLORS.surface : COLORS.amber,
                color: running ? COLORS.textDim : COLORS.bg,
                border: `1px solid ${running ? COLORS.border : COLORS.amber}`,
                cursor: running ? 'not-allowed' : 'pointer',
                opacity: running ? 0.7 : 1,
              }}
            >
              <span
                className="text-[10px] uppercase tracking-[0.22em] font-semibold flex items-center gap-2"
                style={{ fontFamily: 'ui-monospace, monospace' }}
              >
                {running ? 'Procesando · 30d' : completed ? 'Re-ejecutar · 30d' : 'Ejecutar simulación · 30d'}
                {!running && <IconChevronRight color={running ? COLORS.textDim : COLORS.bg} />}
              </span>
            </button>
          </div>
        </RoleHeader>

        {/* Parameter panel */}
        <div
          className="rounded-sm p-6 mb-8"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <span className="h-1 w-8" style={{ background: COLORS.amber }} />
              <span
                className="text-[10px] uppercase tracking-[0.22em]"
                style={{ color: COLORS.textDim, fontFamily: 'ui-monospace, monospace' }}
              >
                Parametrización del modelo
              </span>
            </div>
            <button
              onClick={resetParams}
              className="text-[10px] uppercase tracking-[0.22em] transition-colors flex items-center gap-2"
              style={{
                color: COLORS.textDim,
                fontFamily: 'ui-monospace, monospace',
                background: 'transparent',
                cursor: 'pointer',
                border: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.textDim; }}
            >
              <IconRefresh /> Reset
            </button>
          </div>

          <div className="flex flex-wrap gap-8">
            <ParamSlider
              label="Capacidad por gestor"
              value={params.capacityPerManager}
              min={150} max={500} step={10}
              unit="exp/día"
              accent={COLORS.sage}
              onChange={set('capacityPerManager')}
              hint={`Capacidad total instalada: ${fmtInt(params.capacityPerManager * 39)} exp/día`}
            />
            <ParamSlider
              label="Límite Fast-Track"
              value={params.fastTrackPct}
              min={5} max={50} step={5}
              unit="%"
              accent={COLORS.amber}
              onChange={set('fastTrackPct')}
              hint={`≈ ${Math.floor(params.capacityPerManager * params.fastTrackPct / 100)} reactivaciones/gestor`}
            />
            <ParamSlider
              label="Límite Cola Pasiva"
              value={params.colaPasivaLimit}
              min={0} max={1500} step={50}
              unit="exp/día"
              accent={COLORS.sky}
              onChange={set('colaPasivaLimit')}
              hint="Expedientes con menor SRS → SMS/Email"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6 mb-10">
          <ContextItem label="Inflow diario"       value="12.000" unit="exp." />
          <ContextItem label="Gestores · 3 tramos" value="39"     unit={`× ${params.capacityPerManager}/día`} />
          <ContextItem label="Capacidad instalada" value={fmtInt(params.capacityPerManager * 39)} unit="exp./día" />
          <ContextItem label="Cola pasiva máx."    value={fmtInt(params.colaPasivaLimit)} unit="exp./día" />
        </div>

        <div className="grid grid-cols-3 gap-6 mb-10">
          <KPICard
            label="Gestionados antes de 60 días"
            value={kpis.pctBefore60.toFixed(1)}
            suffix="%"
            accent={COLORS.amber}
            sublabel="KPI principal · objetivo Opplus"
            hint="Proporción de expedientes procesados antes del umbral crítico de los 60 días."
          />
          <KPICard
            label="Volumen desviado a cola pasiva"
            value={fmtInt(kpis.colaPasiva)}
            accent={COLORS.sky}
            sublabel="Vía automatizada SMS/Email"
            hint="Casos retirados del flujo manual de los 39 gestores durante los 30 días."
          />
          <KPICard
            label="Productividad del equipo"
            value={kpis.productivity.toFixed(1)}
            suffix="%"
            accent={COLORS.sage}
            sublabel={`${fmtInt(kpis.resolved)} expedientes resueltos`}
            hint={`Ratio entre gestionados activos y capacidad instalada (${fmtInt(data.length * params.capacityPerManager * 39)}).`}
          />
        </div>

        {/* Business impact */}
        <div
          className="rounded-sm p-7 mb-10"
          style={{
            background: `linear-gradient(135deg, ${COLORS.surface} 0%, ${COLORS.surfaceLo} 100%)`,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="h-1 w-8" style={{ background: COLORS.sage }} />
            <span
              className="text-[10px] uppercase tracking-[0.22em]"
              style={{ color: COLORS.textDim, fontFamily: 'ui-monospace, monospace' }}
            >
              Impacto de Negocio
            </span>
          </div>

          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-7">
              <div
                className="text-[10px] uppercase tracking-[0.22em] mb-4"
                style={{ color: COLORS.textMute, fontFamily: 'ui-monospace, monospace' }}
              >
                Beneficio cuantitativo
              </div>
              <div className="grid grid-cols-3 gap-6">
                <ImpactBlock
                  label="Horas-hombre liberadas"
                  value={fmtInt(impact.hours)}
                  unit="h"
                  accent={COLORS.amber}
                  detail="15 min ahorrados por caso desviado"
                />
                <ImpactBlock
                  label="Jornadas equivalentes"
                  value={fmtInt(impact.workdays)}
                  unit="j · 8h"
                  accent={COLORS.sage}
                  detail="Tiempo de gestión recuperado"
                />
                <ImpactBlock
                  label="Equivalente FTE"
                  value={impact.fteForMonth.toFixed(2)}
                  unit="× mes"
                  accent={COLORS.sky}
                  detail="Personas-mes liberadas (22 j/mes)"
                />
              </div>
            </div>

            <div className="col-span-5" style={{ borderLeft: `1px solid ${COLORS.border}`, paddingLeft: 32 }}>
              <div
                className="text-[10px] uppercase tracking-[0.22em] mb-4"
                style={{ color: COLORS.textMute, fontFamily: 'ui-monospace, monospace' }}
              >
                Beneficio cualitativo
              </div>
              <div className="flex flex-col gap-2.5">
                <BenefitBadge accent={COLORS.amber}>Carga cognitiva eliminada · cero autoasignación</BenefitBadge>
                <BenefitBadge accent={COLORS.sage}>Estandarización del proceso al 100%</BenefitBadge>
                <BenefitBadge accent={COLORS.sky}>Protección de reactivaciones asegurada</BenefitBadge>
                <BenefitBadge accent={COLORS.violet}>Decisión auditable y trazable</BenefitBadge>
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-5 gap-6 mb-10">
          <div className="col-span-3">
            <ChartFrame
              title="Evolución temporal"
              subtitle="Backlog activo · Casos resueltos diarios"
              accent={COLORS.amber}
            >
              <div style={{ height: 360 }}>
                {data.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                      <CartesianGrid stroke={COLORS.border} strokeDasharray="2 4" vertical={false} />
                      <XAxis
                        dataKey="day" stroke={COLORS.textMute}
                        tick={{ fill: COLORS.textDim, fontSize: 11, fontFamily: 'ui-monospace, monospace' }}
                        tickLine={false}
                        axisLine={{ stroke: COLORS.border }}
                        label={{ value: 'DÍA', position: 'insideBottomRight', offset: -2, fill: COLORS.textMute, fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                      />
                      <YAxis
                        stroke={COLORS.textMute}
                        tick={{ fill: COLORS.textDim, fontSize: 11, fontFamily: 'ui-monospace, monospace' }}
                        tickLine={false} axisLine={false}
                        tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ stroke: COLORS.borderHi, strokeWidth: 1 }} />
                      <Legend
                        wrapperStyle={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase', letterSpacing: '0.15em', color: COLORS.textDim, paddingTop: 12 }}
                        iconType="rect" iconSize={8}
                      />
                      <Line type="monotone" dataKey="backlog"  name="Backlog"   stroke={COLORS.coral} strokeWidth={2} dot={false}
                            activeDot={{ r: 4, fill: COLORS.coral, stroke: COLORS.bg, strokeWidth: 2 }} isAnimationActive={false} />
                      <Line type="monotone" dataKey="resolved" name="Resueltos" stroke={COLORS.sage}  strokeWidth={2} dot={false}
                            activeDot={{ r: 4, fill: COLORS.sage, stroke: COLORS.bg, strokeWidth: 2 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ChartFrame>
          </div>

          <div className="col-span-2">
            <ChartFrame
              title="Reparto diario"
              subtitle="Fast-Track · Standard · Cola Pasiva"
              accent={COLORS.sky}
            >
              <div style={{ height: 360 }}>
                {data.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gFT" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={COLORS.amber} stopOpacity={0.85} />
                          <stop offset="100%" stopColor={COLORS.amber} stopOpacity={0.25} />
                        </linearGradient>
                        <linearGradient id="gSP" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={COLORS.sage} stopOpacity={0.85} />
                          <stop offset="100%" stopColor={COLORS.sage} stopOpacity={0.25} />
                        </linearGradient>
                        <linearGradient id="gCP" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={COLORS.sky} stopOpacity={0.85} />
                          <stop offset="100%" stopColor={COLORS.sky} stopOpacity={0.25} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={COLORS.border} strokeDasharray="2 4" vertical={false} />
                      <XAxis
                        dataKey="day" stroke={COLORS.textMute}
                        tick={{ fill: COLORS.textDim, fontSize: 11, fontFamily: 'ui-monospace, monospace' }}
                        tickLine={false} axisLine={{ stroke: COLORS.border }}
                      />
                      <YAxis
                        stroke={COLORS.textMute}
                        tick={{ fill: COLORS.textDim, fontSize: 11, fontFamily: 'ui-monospace, monospace' }}
                        tickLine={false} axisLine={false}
                        tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ stroke: COLORS.borderHi, strokeWidth: 1 }} />
                      <Legend
                        wrapperStyle={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase', letterSpacing: '0.15em', color: COLORS.textDim, paddingTop: 12 }}
                        iconType="rect" iconSize={8}
                      />
                      <Area type="monotone" dataKey="fastTrack"  name="Fast-Track"  stackId="1" stroke={COLORS.amber} fill="url(#gFT)" strokeWidth={1.5} isAnimationActive={false} />
                      <Area type="monotone" dataKey="standard"   name="Standard"    stackId="1" stroke={COLORS.sage}  fill="url(#gSP)" strokeWidth={1.5} isAnimationActive={false} />
                      <Area type="monotone" dataKey="colaPasiva" name="Cola Pasiva" stackId="1" stroke={COLORS.sky}   fill="url(#gCP)" strokeWidth={1.5} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ChartFrame>
          </div>
        </div>

        {/* Footer stats */}
        <div
          className="grid grid-cols-4 gap-6 mb-10 p-6 rounded-sm"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
        >
          <FooterStat label="Backlog medio"     value={fmtInt(kpis.avgBacklog)}       unit="exp/día"     accent={COLORS.coral} />
          <FooterStat label="Mora (>90 d)"       value={fmtInt(kpis.discarded)}        unit="descartado"  accent={COLORS.textDim} />
          <FooterStat label="Total procesado"   value={fmtInt(totals.totalProcessed)} unit="expedientes" accent={COLORS.sage} />
          <FooterStat
            label="Cobertura vs inflow"
            value={data.length > 0 ? fmtPct((totals.totalProcessed / (12000 * data.length)) * 100, 1) : '—'}
            unit="ratio" accent={COLORS.amber}
          />
        </div>

        {/* Methodology */}
        <div
          className="pt-6 text-[11px] leading-relaxed"
          style={{
            color: COLORS.textMute,
            borderTop: `1px solid ${COLORS.border}`,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="uppercase tracking-[0.2em] mb-2" style={{ color: COLORS.textDim }}>Smart Recovery Score</div>
              <code style={{ color: COLORS.amber }}>Score = ( I · ωₚ / ln(e + F) ) · C(D)</code>
              <div className="mt-2">
                C(D): 1–15 d → 1.20 · 16–45 d → 1.00 · 46–60 d → 1.0 + (D-45)·0.05 · 61–90 d → 2.00
              </div>
            </div>
            <div>
              <div className="uppercase tracking-[0.2em] mb-2" style={{ color: COLORS.textDim }}>Lógica de enrutamiento</div>
              <div>1 · Fast-Track (reactivación, ≤{params.fastTrackPct}% capacidad)</div>
              <div>2 · Cola pasiva (≤{params.colaPasivaLimit} menores scores → SMS/Email)</div>
              <div>3 · Standard Pool (mayor score → tramo de especialización)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MAIN
   ════════════════════════════════════════════════════════════════════ */

export default function MIDIApp() {
  const [view, setView] = useState('landing');  // 'landing' | 'director' | 'gestor'
  const [params, setParams] = useState({ ...DEFAULT_PARAMS });

  const [data, setData] = useState([]);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [currentDay, setCurrentDay] = useState(0);
  const [totals, setTotals] = useState({
    resolved: 0, processedBefore60: 0, totalProcessed: 0, colaPasiva: 0, discarded: 0,
  });

  const [gestorQueue, setGestorQueue]         = useState([]);
  const [gestorCompleted, setGestorCompleted] = useState(0);

  const runIdRef = useRef(0);

  useEffect(() => {
    if (!running) {
      const q = computeInitialQueue(params);
      setGestorQueue(q);
      setGestorCompleted(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.capacityPerManager, params.fastTrackPct, params.colaPasivaLimit]);

  async function runSimulation() {
    if (running) return;
    const myRunId = ++runIdRef.current;

    setRunning(true);
    setCompleted(false);
    setData([]);
    setCurrentDay(0);
    setTotals({ resolved: 0, processedBefore60: 0, totalProcessed: 0, colaPasiva: 0, discarded: 0 });

    const idCounterRef = { v: 0 };
    let pool = [];
    for (let i = 0; i < 12000; i++) pool.push(mkExpedient(idCounterRef.v++, 0));

    const acc = [];
    const agg = { resolved: 0, processedBefore60: 0, totalProcessed: 0, colaPasiva: 0, discarded: 0 };

    for (let day = 1; day <= 30; day++) {
      if (runIdRef.current !== myRunId) return;
      const isDay1 = day === 1;
      const { pool: nextPool, metrics, mgr1Queue } = stepDay(pool, day, idCounterRef, params, isDay1);
      pool = nextPool;

      agg.resolved          += metrics.resolved;
      agg.processedBefore60 += metrics.processedBefore60;
      agg.totalProcessed    += metrics.totalProcessed;
      agg.colaPasiva        += metrics.colaPasiva;
      agg.discarded         += metrics.discarded;

      acc.push(metrics);
      setData([...acc]);
      setCurrentDay(day);
      setTotals({ ...agg });

      if (isDay1) {
        const ft = mgr1Queue.filter(e => e.routing === 'fast-track').sort((a,b) => b.score - a.score);
        const st = mgr1Queue.filter(e => e.routing === 'standard').sort((a,b) => b.score - a.score);
        setGestorQueue([...ft, ...st].slice(0, 15));
        setGestorCompleted(0);
      }

      await new Promise(r => setTimeout(r, 45));
    }

    setRunning(false);
    setCompleted(true);
  }

  const kpis = useMemo(() => {
    if (!data.length) {
      return { pctBefore60: 0, colaPasiva: 0, productivity: 0, resolved: 0, discarded: 0, avgBacklog: 0 };
    }
    const totalCapacity = data.length * params.capacityPerManager * 39;
    return {
      pctBefore60:  totals.totalProcessed > 0 ? (totals.processedBefore60 / totals.totalProcessed) * 100 : 0,
      colaPasiva:   totals.colaPasiva,
      productivity: totalCapacity > 0 ? (totals.resolved / totalCapacity) * 100 : 0,
      resolved:     totals.resolved,
      discarded:    totals.discarded,
      avgBacklog:   data.reduce((s, d) => s + d.backlog, 0) / data.length,
    };
  }, [data, totals, params.capacityPerManager]);

  const impact = useMemo(() => {
    const hours       = totals.colaPasiva * 0.25;
    const workdays    = hours / 8;
    const fteForMonth = workdays / 22;
    return { hours, workdays, fteForMonth };
  }, [totals.colaPasiva]);

  const status = running ? 'running' : (completed ? 'done' : 'idle');
  const statusLabel = running
    ? `Simulando · día ${currentDay}/30`
    : completed ? 'Simulación completa · 30 días' : 'Sistema en espera';

  const handleGestionar = () => {
    setGestorQueue(q => q.slice(1));
    setGestorCompleted(c => c + 1);
  };
  const handleReloadQueue = () => {
    const q = computeInitialQueue(params);
    setGestorQueue(q);
    setGestorCompleted(0);
  };

  if (view === 'landing') {
    return <LandingScreen onSelect={setView} />;
  }

  if (view === 'director') {
    return (
      <DirectorView
        onBack={() => setView('landing')}
        status={status}
        statusLabel={statusLabel}
        running={running}
        completed={completed}
        runSimulation={runSimulation}
        params={params}
        setParams={setParams}
        data={data}
        kpis={kpis}
        impact={impact}
        totals={totals}
      />
    );
  }

  // view === 'gestor'
  return (
    <GestorView
      onBack={() => setView('landing')}
      queue={gestorQueue}
      onGestionar={handleGestionar}
      onReload={handleReloadQueue}
      completed={gestorCompleted}
      status={status}
      statusLabel={statusLabel}
    />
  );
}
