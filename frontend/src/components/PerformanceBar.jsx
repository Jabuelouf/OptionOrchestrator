/**
 * PerformanceBar - Finviz-style horizontal bar showing positive/negative change.
 * A centered-zero bar: positive extends right, negative extends left.
 *
 * Props:
 *   value   - numeric change value (e.g. 2.5 or -1.3)
 *   max     - optional max absolute value for scaling (default 5)
 *   label   - optional label text to show alongside the bar
 *   width   - optional bar track width in px (default 60)
 */
export default function PerformanceBar({ value = 0, max = 5, label, width = 60 }) {
    const v = Number(value) || 0;
    const pct = Math.min(Math.abs(v) / max, 1) * 50; // 50% = full one side
    const isPos = v >= 0;
    const cls = isPos ? 'pos' : 'neg';

    return (
        <span className="perf-bar">
            <span className="perf-bar-track" style={{ width }}>
                {isPos ? (
                    <span className="perf-bar-fill pos-fill" style={{ width: `${pct}%` }} />
                ) : (
                    <span className="perf-bar-fill neg-fill" style={{ width: `${pct}%` }} />
                )}
            </span>
            {label && (
                <span className={`mono ${cls}`} style={{ fontSize: 11, minWidth: 45, textAlign: 'right' }}>
                    {label}
                </span>
            )}
        </span>
    );
}
