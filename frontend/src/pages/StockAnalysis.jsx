import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { LoadingSpinner, PerformanceBar, ProChart, StockSearch } from '../components';

const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'chart', label: 'Chart' },
    { key: 'options', label: 'Options' },
    { key: 'strategies', label: 'Strategies' },
    { key: 'fundamentals', label: 'Fundamentals' },
    { key: 'rescue', label: 'Rescue' },
];

const STRATEGY_GROUPS = [
    { label: '-- Select Strategy --', value: '' },
    {
        label: 'Income', options: [
            { value: 'covered_call', label: 'Covered Calls' },
            { value: 'cash_secured_put', label: 'Cash-Secured Puts' },
            { value: 'wheel', label: 'Wheel Strategy' },
        ]
    },
    {
        label: 'Directional', options: [
            { value: 'long_options', label: 'Long Options' },
            { value: 'protective_put', label: 'Protective Puts' },
            { value: 'vertical_spread', label: 'Vertical Spreads' },
        ]
    },
    {
        label: 'Volatility', options: [
            { value: 'iron_condor', label: 'Iron Condors' },
            { value: 'straddle', label: 'Straddles / Strangles' },
            { value: 'butterfly', label: 'Butterfly Spreads' },
        ]
    },
    {
        label: 'Advanced', options: [
            { value: 'time_spread', label: 'Time Spreads' },
            { value: 'ratio_spread', label: 'Ratio Spreads' },
            { value: 'jade_lizard', label: 'Jade Lizards' },
        ]
    },
];

const INTERVALS = [
    { key: '1m', label: '1m' },
    { key: '5m', label: '5m' },
    { key: '15m', label: '15m' },
    { key: '30m', label: '30m' },
    { key: '1h', label: '1H' },
    { key: '1d', label: '1D' },
    { key: '1wk', label: '1W' },
];

// Period options that make sense for each interval
const RANGES_BY_INTERVAL = {
    '1m':  [{ label: '1D', period: '1d' }, { label: '5D', period: '5d' }],
    '5m':  [{ label: '1D', period: '1d' }, { label: '5D', period: '5d' }],
    '15m': [{ label: '1D', period: '1d' }, { label: '5D', period: '5d' }, { label: '1M', period: '1mo' }],
    '30m': [{ label: '1D', period: '1d' }, { label: '5D', period: '5d' }, { label: '1M', period: '1mo' }],
    '1h':  [{ label: '5D', period: '5d' }, { label: '1M', period: '1mo' }, { label: '3M', period: '3mo' }],
    '1d':  [{ label: '5D', period: '5d' }, { label: '1M', period: '1mo' }, { label: '3M', period: '3mo' }, { label: '6M', period: '6mo' }, { label: '1Y', period: '1y' }],
    '1wk': [{ label: '3M', period: '3mo' }, { label: '6M', period: '6mo' }, { label: '1Y', period: '1y' }, { label: '2Y', period: '2y' }],
};

const DEFAULT_PERIOD = {
    '1m': '1d', '5m': '1d', '15m': '5d', '30m': '5d', '1h': '1mo', '1d': '1mo', '1wk': '1y',
};

function StockAnalysis() {
    const { symbol } = useParams();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [chartInterval, setChartInterval] = useState('1d');
    const [chartPeriod, setChartPeriod] = useState('1mo');
    const [chartHistory, setChartHistory] = useState(null); // null = not loaded yet, [] = loaded but empty
    const [chartLoading, setChartLoading] = useState(false);

    // Options state
    const [expirations, setExpirations] = useState([]);
    const [selectedExp, setSelectedExp] = useState('');
    const [chain, setChain] = useState(null);
    const [chainLoading, setChainLoading] = useState(false);
    const [optionsLoaded, setOptionsLoaded] = useState(false);

    // Fundamentals state
    const [fundLoading, setFundLoading] = useState(false);
    const [filings, setFilings] = useState([]);
    const [filingAnalysisLoading, setFilingAnalysisLoading] = useState(false);
    const [filingAnalysis, setFilingAnalysis] = useState(null);

    // Rescue state
    const [rescueLoading, setRescueLoading] = useState(false);
    const [rescueInput, setRescueInput] = useState(() => JSON.stringify({
        position: {
            symbol: 'SPY',
            legs: [
                { option_type: 'call', strike: 500, expiry: '2026-02-16', quantity: 1, entry_price: 2.5 }
            ]
        },
        user: { risk_tolerance: 'moderate', objective: 'rescue' }
    }, null, 2));
    const [rescueOutput, setRescueOutput] = useState(null);

    // Selected strategy from dropdown
    const [selectedStrategy, setSelectedStrategy] = useState('');

    // Load main analysis
    useEffect(() => {
        if (!symbol) return;
        let alive = true;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.market.getAnalysis(symbol, {
                    history_period: '1mo',
                    history_interval: '1d',
                    lookback_period: '6mo',
                    news_limit: 5,
                });
                if (!alive) return;
                setData(res.data);
                setChartHistory(Array.isArray(res.data?.history) ? res.data.history : []);
            } catch (e) {
                if (!alive) return;
                setError('Failed to load analysis.');
                setData(null);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [symbol]);

    useEffect(() => {
        if (!symbol) return;
        let alive = true;
        setChartHistory(null);
        (async () => {
            setChartLoading(true);
            try {
                const res = await api.market.getHistory(symbol, chartPeriod, chartInterval);
                if (!alive) return;
                setChartHistory(Array.isArray(res.data) ? res.data : []);
            } catch (e) {
                if (!alive) return;
                setChartHistory([]);
            } finally {
                if (alive) setChartLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [symbol, chartPeriod, chartInterval]);

    // Load options expirations on tab switch
    useEffect(() => {
        if (activeTab !== 'options' || !symbol || optionsLoaded) return;
        let alive = true;
        (async () => {
            try {
                const res = await api.market.getExpirations(symbol);
                if (!alive) return;
                const exps = res.data || [];
                setExpirations(exps);
                if (exps.length && !selectedExp) setSelectedExp(exps[0]);
                setOptionsLoaded(true);
            } catch (e) {
                if (!alive) return;
                setExpirations([]);
            }
        })();
        return () => { alive = false; };
    }, [activeTab, symbol, optionsLoaded, selectedExp]);

    // Load chain on expiration change
    useEffect(() => {
        if (activeTab !== 'options' || !symbol || !selectedExp) return;
        let alive = true;
        setChainLoading(true);
        (async () => {
            try {
                const res = await api.market.getOptionsChain(symbol, selectedExp);
                if (!alive) return;
                setChain(res.data);
            } catch (e) {
                if (!alive) return;
                setChain(null);
            } finally {
                if (alive) setChainLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [activeTab, symbol, selectedExp]);

    const ohlcRows = useMemo(() => {
        const hist = chartHistory !== null ? chartHistory : (data?.history || []);
        return hist.filter((p) =>
            p &&
            Number.isFinite(Number(p.open)) &&
            Number.isFinite(Number(p.high)) &&
            Number.isFinite(Number(p.low)) &&
            Number.isFinite(Number(p.close))
        );
    }, [data, chartHistory]);

    const go = (sym) => navigate(`/analysis/${sym}`);
    const currentRanges = RANGES_BY_INTERVAL[chartInterval] || RANGES_BY_INTERVAL['1d'];
    const handleIntervalChange = useCallback((iv) => {
        setChartInterval(iv);
        setChartPeriod(DEFAULT_PERIOD[iv] || '1mo');
    }, []);
    const loadCompareHistory = useCallback(async (compareSymbol) => {
        const res = await api.market.getHistory(compareSymbol, chartPeriod, chartInterval);
        return Array.isArray(res?.data) ? res.data : [];
    }, [chartPeriod, chartInterval]);

    // Action functions
    const loadFilings = async () => {
        setFundLoading(true);
        setFilingAnalysis(null);
        try {
            const res = await api.fundamentals.getFilings(symbol);
            setFilings(res.data || []);
        } catch (e) {
            setFilings([]);
        } finally {
            setFundLoading(false);
        }
    };

    const analyzeFiling = async (filingId) => {
        setFilingAnalysisLoading(true);
        try {
            const res = await api.fundamentals.getAnalysis(symbol, filingId);
            setFilingAnalysis(res.data);
        } catch (e) {
            setFilingAnalysis(null);
        } finally {
            setFilingAnalysisLoading(false);
        }
    };

    const runRescue = async () => {
        setRescueLoading(true);
        setRescueOutput(null);
        try {
            const payload = JSON.parse(rescueInput);
            const res = await fetch('/v1/rescue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            setRescueOutput(json);
        } catch (e) {
            setRescueOutput({ error: 'Invalid JSON or backend error.' });
        } finally {
            setRescueLoading(false);
        }
    };

    // Loading / error states
    if (loading) {
        return (
            <div className="container" style={{ padding: '20px 0' }}>
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="container" style={{ padding: '20px 0' }}>
                <div className="row" style={{ marginBottom: 10 }}>
                    <button className="btn" onClick={() => navigate('/')}>Back</button>
                    <div className="spacer" />
                    <div style={{ width: 260 }}>
                        <StockSearch onSearch={go} placeholder="Jump to symbol" />
                    </div>
                </div>
                <div style={{ color: 'var(--neg)', padding: 10, border: '1px solid var(--border)' }}>
                    {error || 'No data.'}
                </div>
            </div>
        );
    }

    const q = data.quote;
    const tech = data.technical;
    const vol = data.volatility;
    const strategies = data.strategies || [];
    const news = data.news || [];

    const chg = Number(q.change_percent || 0);
    const fmtNum = (v, d = 2) => {
        const n = Number(v);
        return Number.isFinite(n) ? n.toFixed(d) : '--';
    };
    const fmtPrice = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return '--';
        return n.toFixed(2);
    };
    const fmtIv = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return '--';
        return `${(n * 100).toFixed(1)}%`;
    };

    return (
        <div className="container" style={{ padding: '8px 0 20px' }}>
            {/* Header: Back + Search */}
            <div className="row" style={{ marginBottom: 6 }}>
                <button className="btn" onClick={() => navigate('/')}>Back</button>
                <div className="spacer" />
                <div style={{ width: 260 }}>
                    <StockSearch onSearch={go} placeholder="Jump to symbol" />
                </div>
            </div>

            {/* Quote header */}
            <div style={{ border: '1px solid var(--border)', padding: '8px 12px', marginBottom: 8 }}>
                <div className="row wrap" style={{ alignItems: 'baseline', gap: 12 }}>
                    <span style={{ fontSize: 18, fontWeight: 800 }}>{q.symbol}</span>
                    <span className="mono" style={{ fontSize: 16, fontWeight: 700 }}>${Number(q.price).toFixed(2)}</span>
                    <PerformanceBar value={chg} max={5} />
                    <span className="muted" style={{ fontSize: 10 }}>
                        {q.timestamp ? new Date(q.timestamp).toLocaleString() : ''}
                    </span>
                </div>

                {/* KPI row */}
                <div className="kpi-row" style={{ marginTop: 6 }}>
                    <div className="kpi-item">
                        <span className="kpi-label">Trend</span>
                        <span className="kpi-value">{tech?.direction || 'n/a'}</span>
                    </div>
                    <div className="kpi-item">
                        <span className="kpi-label">RSI</span>
                        <span className="kpi-value mono">{tech?.rsi?.value ?? 'n/a'}</span>
                    </div>
                    <div className="kpi-item">
                        <span className="kpi-label">Volatility</span>
                        <span className="kpi-value">{vol?.volatility_level || 'n/a'}</span>
                    </div>
                    <div className="kpi-item">
                        <span className="kpi-label">1y Realized</span>
                        <span className="kpi-value mono">
                            {vol?.realized_volatility ? `${Number(vol.realized_volatility).toFixed(2)}%` : 'n/a'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Tab bar */}
            <div className="tab-bar">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
                        onClick={() => setActiveTab(t.key)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && (
                <div className="animate-fade-in">
                    {/* Chart preview */}
                    <div style={{ marginBottom: 10 }}>
                        {ohlcRows.length > 0 ? (
                            <ProChart
                                symbol={q.symbol}
                                data={ohlcRows}
                                height={280}
                                onLoadCompareHistory={loadCompareHistory}
                                intervals={INTERVALS}
                                activeInterval={chartInterval}
                                onIntervalChange={handleIntervalChange}
                                ranges={currentRanges}
                                activeRange={chartPeriod}
                                onRangeChange={setChartPeriod}
                                loading={chartLoading}
                            />
                        ) : !chartLoading && chartHistory !== null ? (
                            <div style={{ color: 'var(--muted)', padding: '24px 0', textAlign: 'center' }}>
                                No data available for {INTERVALS.find((i) => i.key === chartInterval)?.label || chartInterval} interval.
                                <br /><span style={{ fontSize: 11 }}>Try a different interval or check if the market is open.</span>
                            </div>
                        ) : null}
                    </div>

                    {/* Quick strategies */}
                    <div className="section-header">Top Strategies</div>
                    {strategies.length === 0 ? (
                        <div style={{ color: 'var(--muted)', padding: '8px 0' }}>No strategies available.</div>
                    ) : (
                        <table>
                            <thead>
                                <tr>
                                    <th>Strategy</th>
                                    <th>Type</th>
                                    <th className="right">Score</th>
                                    <th>Conditions Fit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {strategies.slice(0, 5).map((s, idx) => (
                                    <tr key={idx}>
                                        <td style={{ fontWeight: 700 }}>{s.strategy_name}</td>
                                        <td className="muted">{s.strategy_type}</td>
                                        <td className="mono right">{Number(s.score).toFixed(0)}%</td>
                                        <td>{s.market_conditions_fit}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* News */}
                    <div className="section-header" style={{ marginTop: 12 }}>News</div>
                    {news.length === 0 ? (
                        <div style={{ color: 'var(--muted)', padding: '8px 0' }}>No news.</div>
                    ) : (
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: 50 }}>Time</th>
                                    <th style={{ width: 80 }}>Source</th>
                                    <th>Headline</th>
                                </tr>
                            </thead>
                            <tbody>
                                {news.map((n, idx) => (
                                    <tr key={idx}>
                                        <td className="mono muted">{String(n.published || '').slice(11, 16)}</td>
                                        <td style={{ fontWeight: 600, color: 'var(--link)' }}>{n.source}</td>
                                        <td>
                                            <a href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {activeTab === 'chart' && (
                <div className="animate-fade-in">
                    {ohlcRows.length > 0 ? (
                        <ProChart
                            symbol={q.symbol}
                            data={ohlcRows}
                            height={420}
                            onLoadCompareHistory={loadCompareHistory}
                            intervals={INTERVALS}
                            activeInterval={chartInterval}
                            onIntervalChange={handleIntervalChange}
                            ranges={currentRanges}
                            activeRange={chartPeriod}
                            onRangeChange={setChartPeriod}
                            loading={chartLoading}
                        />
                    ) : !chartLoading && chartHistory !== null ? (
                        <div style={{ color: 'var(--muted)', padding: '24px 0', textAlign: 'center' }}>
                            No data available for {INTERVALS.find((i) => i.key === chartInterval)?.label || chartInterval} interval.
                            <br /><span style={{ fontSize: 11 }}>Try a different interval or check if the market is open.</span>
                        </div>
                    ) : (
                        <div style={{ color: 'var(--muted)', padding: '12px 0' }}>Loading chart data...</div>
                    )}
                </div>
            )}

            {activeTab === 'options' && (
                <div className="animate-fade-in">
                    <div className="row" style={{ marginBottom: 8 }}>
                        {expirations.length > 0 && (
                            <select
                                className="input"
                                value={selectedExp}
                                onChange={(e) => setSelectedExp(e.target.value)}
                                style={{ maxWidth: 200 }}
                            >
                                {expirations.slice(0, 20).map((exp) => (
                                    <option key={exp} value={exp}>{exp}</option>
                                ))}
                            </select>
                        )}
                        <div className="spacer" />
                        {chain && (
                            <span className="mono muted" style={{ fontSize: 10 }}>
                                Underlying: ${Number(chain.underlying_price).toFixed(2)}
                            </span>
                        )}
                    </div>

                    {chainLoading ? (
                        <LoadingSpinner />
                    ) : chain ? (
                        <div className="grid-2" style={{ gap: 8, alignItems: 'flex-start' }}>
                            {/* Calls */}
                            <div>
                                <div className="section-header" style={{ color: 'var(--pos)', margin: '0 0 4px' }}>Calls</div>
                                <div style={{ overflowX: 'auto', border: '1px solid var(--border)' }}>
                                    <table>
                                        <thead>
                                            <tr><th>Strike</th><th className="right">Last</th><th className="right">Bid</th><th className="right">Ask</th><th className="right">IV</th></tr>
                                        </thead>
                                        <tbody>
                                            {(chain.calls || []).slice(0, 15).map((c, i) => (
                                                <tr key={i}>
                                                    <td className="mono" style={{ fontWeight: 700 }}>{fmtNum(c.strike, 1)}</td>
                                                    <td className="mono right">{fmtPrice(c.last_price)}</td>
                                                    <td className="mono right">{fmtPrice(c.bid)}</td>
                                                    <td className="mono right">{fmtPrice(c.ask)}</td>
                                                    <td className="mono right muted">{fmtIv(c.implied_volatility)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Puts */}
                            <div>
                                <div className="section-header" style={{ color: 'var(--neg)', margin: '0 0 4px' }}>Puts</div>
                                <div style={{ overflowX: 'auto', border: '1px solid var(--border)' }}>
                                    <table>
                                        <thead>
                                            <tr><th>Strike</th><th className="right">Last</th><th className="right">Bid</th><th className="right">Ask</th><th className="right">IV</th></tr>
                                        </thead>
                                        <tbody>
                                            {(chain.puts || []).slice(0, 15).map((p, i) => (
                                                <tr key={i}>
                                                    <td className="mono" style={{ fontWeight: 700 }}>{fmtNum(p.strike, 1)}</td>
                                                    <td className="mono right">{fmtPrice(p.last_price)}</td>
                                                    <td className="mono right">{fmtPrice(p.bid)}</td>
                                                    <td className="mono right">{fmtPrice(p.ask)}</td>
                                                    <td className="mono right muted">{fmtIv(p.implied_volatility)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ color: 'var(--muted)', padding: '12px 0' }}>No chain available.</div>
                    )}
                </div>
            )}

            {activeTab === 'strategies' && (
                <div className="animate-fade-in">
                    {/* Strategy dropdown with optgroups */}
                    <div className="row" style={{ marginBottom: 10 }}>
                        <select
                            className="input"
                            style={{ minWidth: 250 }}
                            value={selectedStrategy}
                            onChange={(e) => setSelectedStrategy(e.target.value)}
                        >
                            {STRATEGY_GROUPS.map((grp) =>
                                grp.options ? (
                                    <optgroup key={grp.label} label={grp.label}>
                                        {grp.options.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </optgroup>
                                ) : (
                                    <option key={grp.value} value={grp.value}>{grp.label}</option>
                                )
                            )}
                        </select>
                        <div className="spacer" />
                        <span className="muted" style={{ fontSize: 10 }}>
                            {strategies.length} strategies available from analysis
                        </span>
                    </div>

                    {!selectedStrategy ? (
                        <div>
                            {/* Show all strategies as a dense table */}
                            {strategies.length === 0 ? (
                                <div style={{ color: 'var(--muted)', padding: '12px 0' }}>
                                    No strategies loaded. Run analysis first.
                                </div>
                            ) : (
                                <table>
                                    <thead>
                                        <tr>
                                            <th>No.</th>
                                            <th>Strategy</th>
                                            <th>Type</th>
                                            <th className="right">Score</th>
                                            <th>Conditions</th>
                                            <th>Legs</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {strategies.map((s, idx) => (
                                            <tr key={idx}>
                                                <td className="muted">{idx + 1}</td>
                                                <td style={{ fontWeight: 700 }}>{s.strategy_name}</td>
                                                <td className="muted">{s.strategy_type}</td>
                                                <td className="mono right">{Number(s.score).toFixed(0)}%</td>
                                                <td>{s.market_conditions_fit}</td>
                                                <td className="mono">{(s.legs || []).length}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    ) : (
                        <div>
                            {/* Show strategies matching the selected type */}
                            {strategies.filter((s) =>
                                s.strategy_type?.toLowerCase().includes(selectedStrategy.replace('_', ' '))
                                || s.strategy_name?.toLowerCase().includes(selectedStrategy.replace('_', ' '))
                            ).length === 0 ? (
                                <div style={{ color: 'var(--muted)', padding: '12px 0' }}>
                                    No {selectedStrategy.replace('_', ' ')} strategies in current analysis. Results depend on the backend screening.
                                </div>
                            ) : (
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Strategy</th>
                                            <th>Type</th>
                                            <th className="right">Score</th>
                                            <th>Conditions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {strategies
                                            .filter((s) =>
                                                s.strategy_type?.toLowerCase().includes(selectedStrategy.replace('_', ' '))
                                                || s.strategy_name?.toLowerCase().includes(selectedStrategy.replace('_', ' '))
                                            )
                                            .map((s, idx) => (
                                                <tr key={idx}>
                                                    <td style={{ fontWeight: 700 }}>{s.strategy_name}</td>
                                                    <td className="muted">{s.strategy_type}</td>
                                                    <td className="mono right">{Number(s.score).toFixed(0)}%</td>
                                                    <td>{s.market_conditions_fit}</td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'fundamentals' && (
                <div className="animate-fade-in">
                    <div className="row" style={{ marginBottom: 10 }}>
                        <button className="btn primary" onClick={loadFilings} disabled={fundLoading}>
                            {fundLoading ? 'Loading...' : 'Load Filings'}
                        </button>
                    </div>

                    {fundLoading ? (
                        <LoadingSpinner />
                    ) : filings.length === 0 ? (
                        <div style={{ color: 'var(--muted)', padding: '12px 0' }}>No filings loaded. Click "Load Filings".</div>
                    ) : (
                        <div className="grid-2" style={{ alignItems: 'flex-start', gap: 12 }}>
                            <div>
                                <div className="section-header">Filings</div>
                                <table>
                                    <thead>
                                        <tr><th>Type</th><th>Date</th><th></th></tr>
                                    </thead>
                                    <tbody>
                                        {filings.map((f) => (
                                            <tr key={f.filing_id}>
                                                <td className="mono">{f.filing_type}</td>
                                                <td className="mono">{String(f.filing_date).slice(0, 10)}</td>
                                                <td>
                                                    <button className="btn" onClick={() => analyzeFiling(f.filing_id)} disabled={filingAnalysisLoading}>
                                                        Analyze
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div>
                                <div className="section-header">Analysis</div>
                                {filingAnalysisLoading ? (
                                    <LoadingSpinner />
                                ) : filingAnalysis ? (
                                    <div>
                                        <div className="kpi-row">
                                            <div className="kpi-item">
                                                <span className="kpi-label">Verdict</span>
                                                <span className="kpi-value">{filingAnalysis.sentiment?.verdict}</span>
                                            </div>
                                            <div className="kpi-item">
                                                <span className="kpi-label">Polarity</span>
                                                <span className="kpi-value">{filingAnalysis.sentiment?.polarity}</span>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 8 }}>
                                            <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4, textTransform: 'uppercase', color: 'var(--muted)' }}>Risks</div>
                                            <ul style={{ margin: '4px 0 8px 16px', fontSize: 11 }}>
                                                {(filingAnalysis.key_risks || []).map((x, i) => <li key={i}>{x}</li>)}
                                            </ul>
                                            <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4, textTransform: 'uppercase', color: 'var(--muted)' }}>Opportunities</div>
                                            <ul style={{ margin: '4px 0 0 16px', fontSize: 11 }}>
                                                {(filingAnalysis.key_opportunities || []).map((x, i) => <li key={i}>{x}</li>)}
                                            </ul>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--muted)', padding: '8px 0' }}>Select a filing and click Analyze.</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'rescue' && (
                <div className="animate-fade-in">
                    <div className="mono muted" style={{ fontSize: 10, marginBottom: 6 }}>
                        Paste a position payload. This calls POST /v1/rescue.
                    </div>
                    <textarea
                        value={rescueInput}
                        onChange={(e) => setRescueInput(e.target.value)}
                        style={{
                            width: '100%', minHeight: 160, fontFamily: 'var(--mono)', fontSize: 11,
                            border: '1px solid var(--border)', padding: 8, background: 'var(--bg-alt)',
                            color: 'var(--fg)', resize: 'vertical',
                        }}
                    />
                    <div className="row" style={{ marginTop: 6, marginBottom: 10 }}>
                        <button className="btn primary" onClick={runRescue} disabled={rescueLoading}>
                            {rescueLoading ? 'Running...' : 'Run Rescue'}
                        </button>
                    </div>
                    {rescueOutput && (
                        <pre style={{
                            margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)', fontSize: 11,
                            border: '1px solid var(--border)', padding: 10, background: 'var(--bg-alt)',
                            color: 'var(--fg)', maxHeight: 400, overflow: 'auto',
                        }}>
                            {JSON.stringify(rescueOutput, null, 2)}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
}

export default StockAnalysis;
