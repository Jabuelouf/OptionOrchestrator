import React, { useMemo } from 'react';

const Sparkline = ({ points, width = 240, height = 90, stroke = 'var(--link)' }) => {
    const path = useMemo(() => {
        if (!points || points.length < 2) return '';
        const ys = points.map((p) => Number(p)).filter((n) => Number.isFinite(n));
        if (ys.length < 2) return '';
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const span = Math.max(1e-9, maxY - minY);

        return ys.map((y, i) => {
            const x = (i / (ys.length - 1)) * width;
            const yn = (y - minY) / span;
            const yv = (1 - yn) * height;
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${yv.toFixed(2)}`;
        }).join(' ');
    }, [points, width, height]);

    if (!path) return null;

    return (
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
            <path d={path} fill="none" stroke={stroke} strokeWidth="2" />
        </svg>
    );
};

export default Sparkline;
