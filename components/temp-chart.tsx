'use client';

import { CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toUnit } from '@/lib/units';

export interface Point {
  t: number;
  setTemp: number | null;
  supplyTemp: number | null;
  returnTemp: number | null;
  humidity: number | null;
}

const SERIES = [
  { key: 'supplyTemp', name: 'Supply air', color: '#06b6d4' },
  { key: 'returnTemp', name: 'Return air', color: '#8b5cf6' },
  { key: 'setTemp', name: 'Set point', color: '#64748b', dashed: true },
] as const;

export function TempChart({
  points,
  unit,
  rangeMs,
  band,
  hidden,
}: {
  points: Point[];
  unit: 'C' | 'F';
  rangeMs: number;
  band?: { lo: number; hi: number } | null;
  hidden: Set<string>;
}) {
  const data = points.map((p) => ({
    t: p.t,
    setTemp: p.setTemp === null ? null : toUnit(p.setTemp, unit),
    supplyTemp: p.supplyTemp === null ? null : toUnit(p.supplyTemp, unit),
    returnTemp: p.returnTemp === null ? null : toUnit(p.returnTemp, unit),
  }));
  const fmtTick = (t: number) =>
    new Date(t).toLocaleString(undefined, rangeMs > 2 * 86400e3 ? { month: 'short', day: 'numeric' } : { hour: '2-digit', minute: '2-digit' });

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" vertical={false} />
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtTick} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={40} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={48} domain={['auto', 'auto']} unit={`°`} />
        {band && data.length > 1 && (
          <ReferenceArea
            x1={data[0].t}
            x2={data[data.length - 1].t}
            y1={toUnit(band.lo, unit)}
            y2={toUnit(band.hi, unit)}
            ifOverflow="extendDomain"
            fill="#10b981"
            fillOpacity={0.08}
            stroke="#10b981"
            strokeOpacity={0.25}
            strokeDasharray="4 4"
          />
        )}
        <Tooltip
          contentStyle={{ borderRadius: 12, border: '1px solid rgb(148 163 184 / 0.3)', fontSize: 12 }}
          labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
          formatter={(v: number, name: string) => [v === null ? '—' : `${v.toFixed(1)} °${unit}`, name]}
        />
        {SERIES.filter((s) => !hidden.has(s.key)).map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={s.key === 'supplyTemp' ? 2.2 : 1.6}
            strokeDasharray={'dashed' in s ? '5 4' : undefined}
            dot={false}
            connectNulls
            isAnimationActive={false}
            type="monotone"
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export const CHART_SERIES = SERIES;
