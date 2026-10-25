import { useMemo, useState } from 'react';

export default function OHLCChart({ data, height = 320, volumeHeight = 90 }) {
    const [hoverIndex, setHoverIndex] = useState(null);

    const model = useMemo(() => {
        const rows = Array.isArray(data) ? data.filter(Boolean) : [];
        if (!rows.length) return null;
        const lows = rows.map((r) => Number(r.low)).filter((v) => Number.isFinite(v));
        const highs = rows.map((r) => Number(r.high)).filter((v) => Number.isFinite(v));
        if (!lows.length || !highs.length) return null;
        const min = Math.min(...lows);
        const max = Math.max(...highs);
        const span = Math.max(1e-9, max - min);
        const maxVolume = Math.max(...rows.map((r) => Number(r.volume || 0)), 1);
        return { rows, min, max, span, maxVolume };
    }, [data]);

    if (!model) return null;

    const { rows, min, max, span, maxVolume } = model;
    const n = rows.length;
    const w = 1000;
    const h = 1000;
    const gap = 2;
    const candleW = Math.max(1, Math.min(18, (w - (n - 1) * gap) / n * 0.72));
    const hover = hoverIndex != null && hoverIndex >= 0 && hoverIndex < rows.length ? rows[hoverIndex] : rows[rows.length - 1];

    const y = (px) => {
        const v = Number(px);
        const yn = (v - min) / span;
        return (1 - yn) * h;
    };

    return (
        <div style={{ border: '1px solid var(--border)', padding: 10, background: 'var(--bg-alt)' }}>
            <div className="row wrap" style={{ marginBottom: 6, fontSize: 11 }}>
                <span className="mono muted">
                    {String(hover?.date || '').slice(0, 10)}
                </span>
                <span className="mono" style={{ marginLeft: 10 }}>O {Number(hover?.open || 0).toFixed(2)}</span>
                <span className="mono" style={{ marginLeft: 8 }}>H {Number(hover?.high || 0).toFixed(2)}</span>
                <span className="mono" style={{ marginLeft: 8 }}>L {Number(hover?.low || 0).toFixed(2)}</span>
                <span className="mono" style={{ marginLeft: 8 }}>C {Number(hover?.close || 0).toFixed(2)}</span>
                <span className="mono muted" style={{ marginLeft: 8 }}>Vol {(Number(hover?.volume || 0)).toLocaleString()}</span>
                <div className="spacer" />
                <span className="mono muted">Range: {min.toFixed(2)} to {max.toFixed(2)}</span>
            </div>

            <svg
                viewBox="0 0 1000 1000"
                width="100%"
                height={height}
                preserveAspectRatio="none"
                onMouseLeave={() => setHoverIndex(null)}
                onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * w;
                    const slot = Math.max(0, Math.min(n - 1, Math.round(x / ((w - (n - 1) * gap) / n + gap))));
                    setHoverIndex(slot);
                }}
            >
                <line x1="0" y1="0" x2="1000" y2="0" stroke="var(--border)" strokeWidth="2" opacity="0.45" />
                <line x1="0" y1="500" x2="1000" y2="500" stroke="var(--border)" strokeWidth="2" opacity="0.35" />
                <line x1="0" y1="1000" x2="1000" y2="1000" stroke="var(--border)" strokeWidth="2" opacity="0.45" />

                {rows.map((r, i) => {
                    const x = i * ((w - (n - 1) * gap) / n + gap);
                    const cx = x + candleW / 2;
                    const o = Number(r.open);
                    const c = Number(r.close);
                    const hi = Number(r.high);
                    const lo = Number(r.low);
                    const bullish = c >= o;
                    const color = bullish ? 'var(--pos)' : 'var(--neg)';
                    const yOpen = y(o);
                    const yClose = y(c);
                    const top = Math.min(yOpen, yClose);
                    const bodyH = Math.max(1, Math.abs(yClose - yOpen));
                    return (
                        <g key={i} opacity={hoverIndex == null || hoverIndex === i ? 0.95 : 0.65}>
                            <line x1={cx} x2={cx} y1={y(hi)} y2={y(lo)} stroke={color} strokeWidth="2" />
                            <rect x={x} y={top} width={candleW} height={bodyH} fill={color} />
                        </g>
                    );
                })}

                {hoverIndex != null && (
                    <line
                        x1={hoverIndex * ((w - (n - 1) * gap) / n + gap) + candleW / 2}
                        x2={hoverIndex * ((w - (n - 1) * gap) / n + gap) + candleW / 2}
                        y1="0"
                        y2="1000"
                        stroke="var(--link)"
                        strokeWidth="2"
                        opacity="0.5"
                    />
                )}
            </svg>

            <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Volume</div>
                <svg
                    viewBox="0 0 1000 300"
                    width="100%"
                    height={volumeHeight}
                    preserveAspectRatio="none"
                >
                    {rows.map((r, i) => {
                        const vol = Number(r.volume || 0);
                        const x = i * ((w - (n - 1) * gap) / n + gap);
                        const bh = Math.max(1, (vol / maxVolume) * 300);
                        const bullish = Number(r.close) >= Number(r.open);
                        const color = bullish ? 'var(--pos)' : 'var(--neg)';
                        return (
                            <rect key={i} x={x} y={300 - bh} width={candleW} height={bh} fill={color} opacity="0.55" />
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}
