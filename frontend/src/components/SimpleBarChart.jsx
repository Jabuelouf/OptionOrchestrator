import { useMemo } from 'react';

/**
 * SimpleBarChart - minimal SVG bar chart for dense UIs.
 * Props:
 *   points        - numeric array
 *   height        - px
 *   color         - css color (normal mode)
 *   centerZero    - if true, render signed bars around a midline (for returns/P&L)
 *   positiveColor - override positive bar color in centerZero mode
 *   negativeColor - override negative bar color in centerZero mode
 *   labels        - optional string[] (same length as points) for sparse x-axis tick labels
 *   unit          - optional string shown as a badge in the top-left corner (e.g. "Vol", "%", "$")
 */
export default function SimpleBarChart({
    points,
    height = 80,
    color = 'var(--link)',
    centerZero = false,
    positiveColor = 'var(--pos)',
    negativeColor = 'var(--neg)',
    labels,
    unit,
}) {
    const bars = useMemo(() => {
        const ys = (points || []).map((p) => Number(p)).filter((n) => Number.isFinite(n));
        if (ys.length === 0) return null;
        const maxAbs = Math.max(...ys.map((y) => Math.abs(y)), 1e-9);
        const maxY = Math.max(...ys, 1e-9);
        const minY = Math.min(...ys);
        return { ys, maxY, maxAbs, minY };
    }, [points]);

    if (!bars) return null;

    const { ys, maxY, maxAbs, minY } = bars;

    // Reserve bottom 40 virtual units for x-axis labels when labels are provided
    const LABEL_AREA = labels?.length ? 40 : 0;
    const chartH = 1000 - LABEL_AREA; // usable bar drawing area height

    // Font size scaled so text renders ~9px regardless of the height prop
    const svgFontSize = Math.round(9 * (1000 / height));

    // Stride so at most 8 labels are visible regardless of data length
    const stride = Math.max(1, Math.ceil((labels?.length || 0) / 8));

    const w = 1000;
    const n = ys.length;
    const gap = 2; // virtual units between bars
    const barW = Math.max(1, (w - (n - 1) * gap) / n);

    // Compact value formatter for min/max annotations
    function fmtAnnotation(v) {
        if (!Number.isFinite(v)) return '';
        const abs = Math.abs(v);
        if (abs >= 1e9) return (v / 1e9).toFixed(1) + 'B';
        if (abs >= 1e6) return (v / 1e6).toFixed(1) + 'M';
        if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K';
        return v.toFixed(2);
    }

    // Y coordinate of the tallest/lowest bars for annotation placement
    const maxAnnotationY = centerZero
        ? (chartH / 2) - (Math.max(...ys.filter((y) => y >= 0), 0) / maxAbs) * (chartH / 2)
        : 0;
    const minAnnotationY = centerZero && minY < 0
        ? (chartH / 2) + (Math.abs(minY) / maxAbs) * (chartH / 2)
        : chartH - Math.max(1, (Math.abs(minY) / maxY) * chartH);

    return (
        <svg viewBox="0 0 1000 1000" width="100%" height={height} preserveAspectRatio="none" aria-label="Bar chart">
            {/* Center zero midline */}
            {centerZero && (
                <line
                    x1="0"
                    x2="1000"
                    y1={chartH / 2}
                    y2={chartH / 2}
                    stroke="var(--border)"
                    strokeWidth="4"
                    opacity="0.7"
                />
            )}

            {/* Bars */}
            {ys.map((y, i) => {
                const x = i * (barW + gap);
                if (!centerZero) {
                    const bh = Math.max(1, (Math.abs(y) / maxY) * chartH);
                    return (
                        <rect
                            key={i}
                            x={x}
                            y={chartH - bh}
                            width={barW}
                            height={bh}
                            fill={color}
                            opacity="0.55"
                        />
                    );
                }
                const yMid = chartH / 2;
                const bh = Math.max(1, (Math.abs(y) / maxAbs) * yMid);
                const isPos = y >= 0;
                return (
                    <rect
                        key={i}
                        x={x}
                        y={isPos ? yMid - bh : yMid}
                        width={barW}
                        height={bh}
                        fill={isPos ? positiveColor : negativeColor}
                        opacity="0.6"
                    />
                );
            })}

            {/* Unit badge — top-left */}
            {unit && (
                <text
                    x={8}
                    y={svgFontSize + 4}
                    fontSize={svgFontSize}
                    fill="rgba(150,160,170,0.7)"
                    fontFamily="monospace"
                >
                    {unit}
                </text>
            )}

            {/* Max value annotation — right edge near tallest bar */}
            {Number.isFinite(maxY) && maxY > 0 && (
                <text
                    x={990}
                    y={Math.max(svgFontSize, maxAnnotationY + svgFontSize * 0.85)}
                    textAnchor="end"
                    fontSize={svgFontSize * 0.85}
                    fill="rgba(150,160,170,0.55)"
                    fontFamily="monospace"
                >
                    {fmtAnnotation(centerZero ? Math.max(...ys) : maxY)}
                </text>
            )}

            {/* Min value annotation — right edge near lowest bar (centerZero only for negative values) */}
            {centerZero && minY < 0 && (
                <text
                    x={990}
                    y={Math.min(chartH - 4, minAnnotationY + svgFontSize * 0.85)}
                    textAnchor="end"
                    fontSize={svgFontSize * 0.85}
                    fill="rgba(150,160,170,0.55)"
                    fontFamily="monospace"
                >
                    {fmtAnnotation(minY)}
                </text>
            )}

            {/* X-axis sparse tick labels */}
            {labels?.length > 0 && ys.map((_, i) => {
                if (i % stride !== 0) return null;
                const cx = i * (barW + gap) + barW / 2;
                return (
                    <text
                        key={`lbl-${i}`}
                        x={cx}
                        y={chartH + 28}
                        textAnchor="middle"
                        fontSize={svgFontSize}
                        fill="rgba(150,160,170,0.7)"
                        fontFamily="monospace"
                    >
                        {labels[i] || ''}
                    </text>
                );
            })}
        </svg>
    );
}
