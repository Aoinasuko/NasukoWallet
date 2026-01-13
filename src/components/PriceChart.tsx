import { useMemo } from 'react';

export type PricePoint = { t: number; value: number };
export type TradeMarker = { t: number; label: string };

type Props = {
  title: string;
  points: PricePoint[];
  markers?: TradeMarker[];
  valueSuffix?: string;
};

const formatTime = (t: number) => {
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${hh}:${mm}`;
};

export const PriceChart = ({ title, points, markers = [], valueSuffix = '' }: Props) => {
  const { pathD, minV, maxV, minT, maxT } = useMemo(() => {
    if (!points.length) return { pathD: '', minV: 0, maxV: 1, minT: 0, maxT: 1 };
    const vs = points.map(p => p.value);
    const ts = points.map(p => p.t);
    let minV = Math.min(...vs);
    let maxV = Math.max(...vs);
    if (minV === maxV) { minV = minV * 0.98; maxV = maxV * 1.02; }
    const minT = Math.min(...ts);
    const maxT = Math.max(...ts);

    const W = 560, H = 160, PAD = 10;
    const x = (t: number) => {
      if (maxT === minT) return PAD;
      return PAD + ((t - minT) / (maxT - minT)) * (W - PAD*2);
    };
    const y = (v: number) => {
      if (maxV === minV) return H - PAD;
      return H - PAD - ((v - minV) / (maxV - minV)) * (H - PAD*2);
    };

    const d = points
      .sort((a,b)=>a.t-b.t)
      .map((p,i)=>`${i===0?'M':'L'} ${x(p.t).toFixed(2)} ${y(p.value).toFixed(2)}`)
      .join(' ');
    return { pathD: d, minV, maxV, minT, maxT };
  }, [points]);

  const W = 560, H = 160, PAD = 10;

  const xForT = (t:number) => {
    if (!points.length) return PAD;
    if (maxT === minT) return PAD;
    return PAD + ((t - minT) / (maxT - minT)) * (W - PAD*2);
  };

  const last = points.length ? points[points.length-1].value : null;

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-semibold text-white/90">{title}</div>
        {last !== null && (
          <div className="text-xs text-white/70">
            {last.toLocaleString(undefined,{maximumFractionDigits: 8})}{valueSuffix}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white/5 border border-white/10 p-3 overflow-hidden">
        {points.length < 2 ? (
          <div className="text-xs text-white/60">データ取得中…</div>
        ) : (
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <path d={pathD} fill="none" stroke="currentColor" strokeWidth="2" className="text-white/80" />
            {/* markers */}
            {markers.map((m, idx) => {
              const x = xForT(m.t);
              return (
                <g key={idx}>
                  <line x1={x} y1={0} x2={x} y2={H} stroke="currentColor" strokeWidth="1" className="text-white/20" />
                  <text x={x+4} y={12} fontSize="10" fill="currentColor" className="text-white/80">
                    {m.label}
                  </text>
                </g>
              );
            })}
            {/* axes labels */}
            <text x={PAD} y={H-2} fontSize="10" fill="currentColor" className="text-white/50">{formatTime(minT)}</text>
            <text x={W-PAD-40} y={H-2} fontSize="10" fill="currentColor" className="text-white/50">{formatTime(maxT)}</text>
          </svg>
        )}
      </div>
      <div className="mt-1 text-[11px] text-white/50">
        min {minV.toLocaleString(undefined,{maximumFractionDigits: 8})}{valueSuffix} / max {maxV.toLocaleString(undefined,{maximumFractionDigits: 8})}{valueSuffix}
      </div>
    </div>
  );
};
