import React, { useMemo } from 'react';

const SimpleLineChart = ({ points, height = 140 }) => {
    const { path, min, max } = useMemo(() => {
        if (!points || points.length < 2) return { path: '', min: 0, max: 0 };
        const ys = points.map((p) => Number(p) || 0);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const span = Math.max(1e-9, maxY - minY);

        const w = 1000; // virtual width
        const h = 1000; // virtual height
        const d = ys.map((y, i) => {
            const x = (i / (ys.length - 1)) * w;
            const yn = (y - minY) / span;
            const yv = (1 - yn) * h;
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${yv.toFixed(2)}`;
        }).join(' ');

        return { path: d, min: minY, max: maxY };
    }, [points]);

    if (!path) return null;

    return (
        <div className="card" style={{ padding: 12 }}>
            <div className="row" style={{ marginBottom: 8 }}>
                <div className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>
                    Range: {min.toFixed(2)} to {max.toFixed(2)}
                </div>
                <div className="spacer" />
            </div>
            <svg viewBox="0 0 1000 1000" width="100%" height={height} preserveAspectRatio="none">
                <path d={path} fill="none" stroke="var(--link)" strokeWidth="8" />
            </svg>
        </div>
    );
};

export default SimpleLineChart;
