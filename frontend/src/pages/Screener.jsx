import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { LoadingSpinner } from '../components';

// ── Filter definitions ────────────────────────────────────────────────────────
const DESCRIPTIVE_FILTERS = [
    {
        key: 'price', label: 'Price',
        options: [
            { value: '', label: 'Any' },
            { value: 'under5', label: 'Under $5' },
            { value: 'under10', label: 'Under $10' },
            { value: 'under20', label: 'Under $20' },
            { value: 'under50', label: 'Under $50' },
            { value: 'over5', label: 'Over $5' },
            { value: 'over10', label: 'Over $10' },
            { value: 'over20', label: 'Over $20' },
            { value: 'over50', label: 'Over $50' },
            { value: 'over100', label: 'Over $100' },
        ],
    },
    {
        key: 'change', label: 'Change',
        options: [
            { value: '', label: 'Any' },
            { value: 'up5', label: 'Up 5%+' },
            { value: 'up2', label: 'Up 2%+' },
            { value: 'up1', label: 'Up 1%+' },
            { value: 'pos', label: 'Positive' },
            { value: 'neg', label: 'Negative' },
            { value: 'down1', label: 'Down 1%+' },
            { value: 'down2', label: 'Down 2%+' },
            { value: 'down5', label: 'Down 5%+' },
        ],
    },
    {
        key: 'trend', label: 'Trend',
        options: [
            { value: '', label: 'Any' },
            { value: 'bullish', label: 'Bullish' },
            { value: 'neutral', label: 'Neutral' },
            { value: 'bearish', label: 'Bearish' },
        ],
    },
];

const TECHNICAL_FILTERS = [
    {
        key: 'rsi', label: 'RSI (14)',
        options: [
            { value: '', label: 'Any' },
            { value: 'overbought', label: 'Overbought (>70)' },
            { value: 'overbought80', label: 'Overbought (>80)' },
            { value: 'oversold', label: 'Oversold (<30)' },
            { value: 'oversold20', label: 'Oversold (<20)' },
            { value: 'not_overbought', label: 'Not Overbought (<70)' },
            { value: 'not_oversold', label: 'Not Oversold (>30)' },
            { value: 'neutral', label: 'Neutral (30–70)' },
        ],
    },
    {
        key: 'macd_trend', label: 'MACD',
        options: [
            { value: '', label: 'Any' },
            { value: 'bullish', label: 'Bullish' },
            { value: 'neutral', label: 'Neutral' },
            { value: 'bearish', label: 'Bearish' },
        ],
    },
    {
        key: 'sma20_pos', label: 'SMA 20',
        options: [
            { value: '', label: 'Any' },
            { value: 'above', label: 'Price above SMA20' },
            { value: 'below', label: 'Price below SMA20' },
        ],
    },
    {
        key: 'sma50_pos', label: 'SMA 50',
        options: [
            { value: '', label: 'Any' },
            { value: 'above', label: 'Price above SMA50' },
            { value: 'below', label: 'Price below SMA50' },
        ],
    },
    {
        key: 'sma200_pos', label: 'SMA 200',
        options: [
            { value: '', label: 'Any' },
            { value: 'above', label: 'Price above SMA200' },
            { value: 'below', label: 'Price below SMA200' },
        ],
    },
    {
        key: 'sma_cross', label: 'SMA Cross',
        options: [
            { value: '', label: 'Any' },
            { value: 'golden', label: 'Golden Cross (50>200)' },
            { value: 'death', label: 'Death Cross (50<200)' },
        ],
    },
];

const OPTIONS_FILTERS = [
    {
        key: 'iv_rank', label: 'IV Rank',
        options: [
            { value: '', label: 'Any' },
            { value: 'high', label: 'High (>60)' },
            { value: 'mid', label: 'Mid (30–60)' },
            { value: 'low', label: 'Low (<30)' },
        ],
    },
];

const TABS = [
    { key: 'descriptive', label: 'Descriptive', filters: DESCRIPTIVE_FILTERS },
    { key: 'technical', label: 'Technical', filters: TECHNICAL_FILTERS },
    { key: 'options', label: 'Options', filters: OPTIONS_FILTERS },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtChg(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '--';
    return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
function fmtVol(v) {
    const n = Number(v);
    if (!n) return '--';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
}
function smaTag(px, sma) {
    if (!Number.isFinite(Number(sma)) || !Number.isFinite(Number(px))) return null;
    return Number(px) >= Number(sma) ? 'above' : 'below';
}

function filtersToParams(filters) {
    const p = {};
    const { price, change, trend, rsi, macd_trend, sma20_pos, sma50_pos, sma200_pos, sma_cross, iv_rank } = filters;

    if (price === 'under5') p.max_price = 5;
    else if (price === 'under10') p.max_price = 10;
    else if (price === 'under20') p.max_price = 20;
    else if (price === 'under50') p.max_price = 50;
    else if (price === 'over5') p.min_price = 5;
    else if (price === 'over10') p.min_price = 10;
    else if (price === 'over20') p.min_price = 20;
    else if (price === 'over50') p.min_price = 50;
    else if (price === 'over100') p.min_price = 100;

    if (change === 'up5') p.min_change_pct = 5;
    else if (change === 'up2') p.min_change_pct = 2;
    else if (change === 'up1') p.min_change_pct = 1;
    else if (change === 'down1') p.max_change_pct = -1;
    else if (change === 'down2') p.max_change_pct = -2;
    else if (change === 'down5') p.max_change_pct = -5;
    else if (change === 'pos') p.min_change_pct = 0;
    else if (change === 'neg') p.max_change_pct = 0;

    if (trend) p.trend = trend;

    if (rsi === 'overbought') p.rsi_cond = 'overbought';
    else if (rsi === 'overbought80') p.min_rsi = 80;
    else if (rsi === 'oversold') p.rsi_cond = 'oversold';
    else if (rsi === 'oversold20') p.max_rsi = 20;
    else if (rsi === 'not_overbought') p.rsi_cond = 'not_overbought';
    else if (rsi === 'not_oversold') p.rsi_cond = 'not_oversold';
    else if (rsi === 'neutral') p.rsi_cond = 'neutral';

    if (macd_trend) p.macd_trend = macd_trend;
    if (sma20_pos) p.sma20_pos = sma20_pos;
    if (sma50_pos) p.sma50_pos = sma50_pos;
    if (sma200_pos) p.sma200_pos = sma200_pos;
    if (sma_cross) p.sma_cross = sma_cross;

    if (iv_rank === 'high') p.min_iv_rank = 60;
    else if (iv_rank === 'mid') { p.min_iv_rank = 30; p.max_iv_rank = 60; }
    else if (iv_rank === 'low') p.max_iv_rank = 30;

    return p;
}

function initFilters() {
    const f = {};
    [...DESCRIPTIVE_FILTERS, ...TECHNICAL_FILTERS, ...OPTIONS_FILTERS].forEach((fd) => { f[fd.key] = ''; });
    return f;
}

// ── Component ────────────────────────────────────────────────────────────────
function Screener() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [tab, setTab] = useState('descriptive');
    const [filters, setFilters] = useState(initFilters);
    const [customSymbols, setCustomSymbols] = useState('');
    const [sortCol, setSortCol] = useState('change_pct');
    const [sortDir, setSortDir] = useState('desc');

    const setFilter = (key, val) => setFilters((f) => ({ ...f, [key]: val }));

    const run = async () => {
        setLoading(true);
        try {
            const params = filtersToParams(filters);
            if (customSymbols.trim()) params.symbols = customSymbols.trim();
            const res = await api.tools.getScreener(params);
            setRows(res.data || []);
        } catch {
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => { setFilters(initFilters()); setCustomSymbols(''); };

    useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSort = (col) => {
        if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortCol(col); setSortDir('desc'); }
    };

    const sorted = [...rows].sort((a, b) => {
        const av = a[sortCol] ?? (typeof a[sortCol] === 'string' ? '' : 0);
        const bv = b[sortCol] ?? (typeof b[sortCol] === 'string' ? '' : 0);
        if (typeof av === 'string') return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });

    const activeCount = Object.values(filters).filter(Boolean).length + (customSymbols.trim() ? 1 : 0);

    return (
        <div className="container" style={{ padding: '8px 0 24px' }}>
            {/* ── Filter panel ── */}
            <div style={{ background: 'var(--bg-alt)', border: '1px solid var(--border)', marginBottom: 10 }}>
                {/* Tab bar */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                    {TABS.map((t) => (
                        <button
                            key={t.key}
                            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
                            onClick={() => setTab(t.key)}
                        >
                            {t.label}
                        </button>
                    ))}
                    {activeCount > 0 && (
                        <span style={{ marginLeft: 'auto', alignSelf: 'center', padding: '0 10px', fontSize: 11, color: 'var(--muted)' }}>
                            {activeCount} filter{activeCount !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                {/* Filter dropdowns */}
                <div style={{ padding: '8px 10px 6px' }}>
                    {TABS.filter((t) => t.key === tab).map((t) => (
                        <div key={t.key} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
                            {t.filters.map((fd) => (
                                <div key={fd.key}>
                                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>{fd.label}</div>
                                    <select
                                        className="input"
                                        style={{ width: '100%', fontSize: 12 }}
                                        value={filters[fd.key]}
                                        onChange={(e) => setFilter(fd.key, e.target.value)}
                                    >
                                        {fd.options.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                    ))}

                    {/* Custom symbols + action row */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>
                                Custom Symbols (overrides universe)
                            </div>
                            <input
                                className="input"
                                style={{ width: '100%', fontSize: 12 }}
                                placeholder="AAPL, TSLA, NVDA, ..."
                                value={customSymbols}
                                onChange={(e) => setCustomSymbols(e.target.value.toUpperCase())}
                                onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn" onClick={reset} style={{ fontSize: 12 }}>Reset</button>
                            <button className="btn primary" onClick={run} disabled={loading} style={{ fontSize: 12, minWidth: 80 }}>
                                {loading ? 'Scanning…' : 'Screen'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Results ── */}
            <div className="section-header">
                Results
                {!loading && <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>({sorted.length})</span>}
                {loading && <span style={{ marginLeft: 8 }}><LoadingSpinner size="sm" /></span>}
            </div>

            {!loading && sorted.length === 0 ? (
                <div style={{ color: 'var(--muted)', padding: '12px 0' }}>No results. Adjust filters and click Screen.</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: 28 }}>No.</th>
                                <SortTh col="symbol" label="Ticker" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} />
                                <SortTh col="price" label="Price" cls="right" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} />
                                <SortTh col="change_pct" label="Chg %" cls="right" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} />
                                <SortTh col="volume" label="Volume" cls="right" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} />
                                <SortTh col="rsi" label="RSI" cls="right" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} />
                                <SortTh col="macd_trend" label="MACD" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} />
                                <th className="right" style={{ fontSize: 10 }}>SMA20</th>
                                <th className="right" style={{ fontSize: 10 }}>SMA50</th>
                                <th className="right" style={{ fontSize: 10 }}>SMA200</th>
                                <SortTh col="trend" label="Trend" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} />
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((r, idx) => {
                                const chg = Number(r.change_pct);
                                const rsi = Number(r.rsi);
                                const px = Number(r.price);
                                return (
                                    <tr key={r.symbol} className="clickable" onClick={() => navigate(`/analysis/${r.symbol}`)}>
                                        <td className="muted">{idx + 1}</td>
                                        <td className="mono" style={{ fontWeight: 700 }}>
                                            <a href={`/analysis/${r.symbol}`} onClick={(e) => { e.preventDefault(); navigate(`/analysis/${r.symbol}`); }}>
                                                {r.symbol}
                                            </a>
                                        </td>
                                        <td className="mono right">${px.toFixed(2)}</td>
                                        <td className={`mono right ${chg >= 0 ? 'pos' : 'neg'}`}>{fmtChg(chg)}</td>
                                        <td className="mono right muted">{fmtVol(r.volume)}</td>
                                        <td className={`mono right ${rsi > 70 ? 'neg' : rsi < 30 ? 'pos' : ''}`}>{rsi.toFixed(1)}</td>
                                        <td>
                                            <span className={`mono ${r.macd_trend === 'bullish' ? 'pos' : r.macd_trend === 'bearish' ? 'neg' : 'muted'}`} style={{ fontSize: 11 }}>
                                                {r.macd_trend || '--'}
                                            </span>
                                        </td>
                                        <td className="right"><SmaCell px={px} sma={r.sma_20} /></td>
                                        <td className="right"><SmaCell px={px} sma={r.sma_50} /></td>
                                        <td className="right"><SmaCell px={px} sma={r.sma_200} /></td>
                                        <td>
                                            <span className={`mono ${r.trend === 'bullish' ? 'pos' : r.trend === 'bearish' ? 'neg' : 'muted'}`} style={{ fontSize: 11 }}>
                                                {r.trend || '--'}
                                            </span>
                                        </td>
                                        <td>
                                            <button className="btn" style={{ fontSize: 11, padding: '1px 6px' }}
                                                onClick={(e) => { e.stopPropagation(); navigate(`/analysis/${r.symbol}`); }}>
                                                Analyze
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function SortTh({ col, label, cls, sortCol, sortDir, onClick }) {
    const active = sortCol === col;
    return (
        <th className={cls} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => onClick(col)}>
            {label}{active && <span style={{ marginLeft: 3, fontSize: 9, opacity: 0.7 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
        </th>
    );
}

function SmaCell({ px, sma }) {
    if (!Number.isFinite(Number(sma))) return <span className="muted" style={{ fontSize: 11 }}>--</span>;
    const tag = smaTag(px, sma);
    return (
        <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <span className={`mono ${tag === 'above' ? 'pos' : 'neg'}`} style={{ fontSize: 9 }}>{tag === 'above' ? '▲' : '▼'}</span>
            <span className="mono muted">${Number(sma).toFixed(0)}</span>
        </span>
    );
}

export default Screener;
