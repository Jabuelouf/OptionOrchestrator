import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { LoadingSpinner, PerformanceBar, SimpleBarChart, Sparkline } from '../components';

const WATCHLIST_STORAGE_KEY = 'oo_watchlist_symbols_v1';
const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'TSLA'];
const MAX_WATCHLIST_SIZE = 12;

function normalizeSymbol(raw) {
    return String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9.\-^]/g, '');
}

function loadInitialWatchlist() {
    try {
        const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
        if (!raw) return DEFAULT_WATCHLIST;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return DEFAULT_WATCHLIST;
        const out = [];
        for (const item of parsed) {
            const sym = normalizeSymbol(item);
            if (!sym || out.includes(sym)) continue;
            out.push(sym);
            if (out.length >= MAX_WATCHLIST_SIZE) break;
        }
        return out.length ? out : DEFAULT_WATCHLIST;
    } catch {
        return DEFAULT_WATCHLIST;
    }
}

function Dashboard() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [home, setHome] = useState(null);
    const [error, setError] = useState(null);
    const [watchlistCollapsed, setWatchlistCollapsed] = useState(false);
    const [watchlistInput, setWatchlistInput] = useState('');
    const [watchlistSymbols, setWatchlistSymbols] = useState(loadInitialWatchlist);
    const [watchlistData, setWatchlistData] = useState({});
    const [watchlistLoading, setWatchlistLoading] = useState(false);

    useEffect(() => {
        let alive = true;

        const loadHome = async ({ initial = false } = {}) => {
            if (initial) setLoading(true);
            setError(null);
            try {
                // Force a fresh backend compute so movers/tiles update without reload.
                const res = await api.market.getHome({ refresh: true });
                if (!alive) return;
                const d = res?.data || {};
                setHome({
                    timestamp: d.timestamp || null,
                    tiles: Array.isArray(d.tiles) ? d.tiles : [],
                    gainers: Array.isArray(d.gainers) ? d.gainers : [],
                    losers: Array.isArray(d.losers) ? d.losers : [],
                    heatmap: Array.isArray(d.heatmap) ? d.heatmap : [],
                    headlines: Array.isArray(d.headlines) ? d.headlines : [],
                });
            } catch (e) {
                if (!alive) return;
                if (initial) setHome(null);
                setError('Failed to load /api/v1/market/home');
            } finally {
                if (alive && initial) setLoading(false);
            }
        };

        loadHome({ initial: true });
        const timer = setInterval(() => {
            loadHome({ initial: false });
        }, 30000);

        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlistSymbols));
        } catch {
            // Ignore localStorage write failures.
        }
    }, [watchlistSymbols]);

    useEffect(() => {
        let alive = true;

        const loadWatchlist = async () => {
            if (watchlistSymbols.length === 0) {
                if (alive) setWatchlistData({});
                return;
            }
            if (alive) setWatchlistLoading(true);

            const entries = await Promise.all(
                watchlistSymbols.map(async (symbol) => {
                    try {
                        const [quoteRes, newsRes] = await Promise.all([
                            api.market.getQuote(symbol),
                            api.market.getNews(symbol, 3),
                        ]);
                        const quote = quoteRes?.data || null;
                        const news = Array.isArray(newsRes?.data) ? newsRes.data : [];
                        return [symbol, { quote, news, error: null }];
                    } catch {
                        return [symbol, { quote: null, news: [], error: 'Unavailable' }];
                    }
                })
            );

            if (!alive) return;
            const mapped = {};
            for (const [symbol, data] of entries) mapped[symbol] = data;
            setWatchlistData(mapped);
            setWatchlistLoading(false);
        };

        loadWatchlist();
        const timer = setInterval(loadWatchlist, 45000);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [watchlistSymbols]);

    const go = (sym) => navigate(`/analysis/${sym}`);

    const watchlistCountLabel = useMemo(
        () => `${watchlistSymbols.length}/${MAX_WATCHLIST_SIZE}`,
        [watchlistSymbols.length]
    );
    const moverVolumeSeries = useMemo(() => {
        const rows = [...(home?.gainers || []), ...(home?.losers || [])];
        return rows
            .map((r) => Number(r.volume || 0))
            .filter((v) => Number.isFinite(v) && v > 0);
    }, [home]);

    const moverLabels = useMemo(() => {
        const rows = [...(home?.gainers || []), ...(home?.losers || [])];
        return rows
            .filter((r) => Number.isFinite(Number(r.volume || 0)) && Number(r.volume || 0) > 0)
            .map((r) => String(r.symbol || ''));
    }, [home]);

    const addWatchlistSymbol = () => {
        const symbol = normalizeSymbol(watchlistInput);
        if (!symbol) return;
        setWatchlistSymbols((prev) => {
            if (prev.includes(symbol) || prev.length >= MAX_WATCHLIST_SIZE) return prev;
            return [...prev, symbol];
        });
        setWatchlistInput('');
    };

    const removeWatchlistSymbol = (symbol) => {
        setWatchlistSymbols((prev) => prev.filter((s) => s !== symbol));
        setWatchlistData((prev) => {
            const next = { ...prev };
            delete next[symbol];
            return next;
        });
    };

    if (loading) {
        return (
            <div className="container" style={{ padding: '20px 0' }}>
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!home) {
        return (
            <div className="container" style={{ padding: '20px 0' }}>
                <div className="card">
                    <div className="card-header"><span>Dashboard</span></div>
                    <div style={{ color: 'var(--muted)', padding: 10 }}>{error || 'Backend not reachable.'}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="container dashboard-layout" style={{ padding: '8px 0 20px' }}>
            <div className="dashboard-main">
                <div style={{ padding: '4px 0', fontSize: 10, color: 'var(--muted)', borderBottom: '1px solid var(--border-light)', marginBottom: 8 }}>
                    {home.timestamp ? new Date(home.timestamp).toLocaleString() : new Date().toLocaleString()}
                    <span style={{ marginLeft: 8, color: 'var(--fg-secondary)' }}>Market Overview</span>
                </div>

                {home.tiles.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                        <div className="section-header">Indices</div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Index</th>
                                    <th>Symbol</th>
                                    <th className="right">Last</th>
                                    <th className="right">Change %</th>
                                    <th>Performance</th>
                                    <th style={{ width: 100 }}>Trend</th>
                                </tr>
                            </thead>
                            <tbody>
                                {home.tiles.map((t) => {
                                    const chg = Number(t.change_percent) || 0;
                                    return (
                                        <tr key={t.symbol} className="clickable" onClick={() => go(t.symbol)}>
                                            <td style={{ fontWeight: 700 }}>{t.label}</td>
                                            <td className="mono">{t.symbol}</td>
                                            <td className="mono right">${Number(t.price).toFixed(2)}</td>
                                            <td className={`mono right ${chg >= 0 ? 'pos' : 'neg'}`}>
                                                {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                                            </td>
                                            <td><PerformanceBar value={chg} /></td>
                                            <td>
                                                {t.spark && t.spark.length > 0 && (
                                                    <Sparkline points={t.spark} height={22} width={90} stroke={chg >= 0 ? 'var(--pos)' : 'var(--neg)'} />
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="grid-2" style={{ marginBottom: 10 }}>
                    <div>
                        <div className="section-header">Top Gainers</div>
                        {home.gainers.length === 0 ? (
                            <div style={{ color: 'var(--muted)', padding: 6 }}>No data</div>
                        ) : (
                            <table>
                                <thead>
                                    <tr><th>No.</th><th>Ticker</th><th className="right">Last</th><th className="right">Change</th><th>Bar</th></tr>
                                </thead>
                                <tbody>
                                    {home.gainers.map((r, i) => {
                                        const chg = Number(r.change_percent) || 0;
                                        return (
                                            <tr key={r.symbol} className="clickable" onClick={() => go(r.symbol)}>
                                                <td className="muted">{i + 1}</td>
                                                <td className="mono" style={{ fontWeight: 700 }}>{r.symbol}</td>
                                                <td className="mono right">${Number(r.price).toFixed(2)}</td>
                                                <td className={`mono right ${chg >= 0 ? 'pos' : 'neg'}`}>
                                                    {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                                                </td>
                                                <td><PerformanceBar value={chg} max={10} width={50} /></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <div>
                        <div className="section-header">Top Losers</div>
                        {home.losers.length === 0 ? (
                            <div style={{ color: 'var(--muted)', padding: 6 }}>No data</div>
                        ) : (
                            <table>
                                <thead>
                                    <tr><th>No.</th><th>Ticker</th><th className="right">Last</th><th className="right">Change</th><th>Bar</th></tr>
                                </thead>
                                <tbody>
                                    {home.losers.map((r, i) => {
                                        const chg = Number(r.change_percent) || 0;
                                        return (
                                            <tr key={r.symbol} className="clickable" onClick={() => go(r.symbol)}>
                                                <td className="muted">{i + 1}</td>
                                                <td className="mono" style={{ fontWeight: 700 }}>{r.symbol}</td>
                                                <td className="mono right">${Number(r.price).toFixed(2)}</td>
                                                <td className={`mono right ${chg >= 0 ? 'pos' : 'neg'}`}>
                                                    {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                                                </td>
                                                <td><PerformanceBar value={chg} max={10} width={50} /></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                    <div className="section-header">Mover Volume Bars</div>
                    {moverVolumeSeries.length > 0 ? (
                        <div style={{ border: '1px solid var(--border)', padding: 8, background: 'var(--bg-alt)' }}>
                            <SimpleBarChart points={moverVolumeSeries} height={110} color="var(--fg-secondary)" labels={moverLabels} unit="Vol" />
                        </div>
                    ) : (
                        <div style={{ color: 'var(--muted)', padding: 6 }}>No live mover volume data available.</div>
                    )}
                </div>

                {home.heatmap.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                        <div className="section-header">Sector Performance</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 2 }}>
                            {home.heatmap.map((h) => {
                                const ch = Number(h.change_percent) || 0;
                                const intensity = Math.min(Math.abs(ch) / 3, 1);
                                const bg = ch >= 0
                                    ? `rgba(10, 110, 10, ${0.1 + intensity * 0.5})`
                                    : `rgba(176, 0, 32, ${0.1 + intensity * 0.5})`;
                                const fg = intensity > 0.3 ? '#fff' : 'var(--fg)';
                                return (
                                    <div
                                        key={h.symbol}
                                        className="heatmap-cell"
                                        onClick={() => go(h.symbol)}
                                        title={`${h.symbol} ${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`}
                                        style={{ background: bg, color: fg }}
                                    >
                                        <span>{h.symbol}</span>
                                        <span style={{ fontSize: 9 }}>{ch >= 0 ? '+' : ''}{ch.toFixed(1)}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {home.headlines.length > 0 && (
                    <div>
                        <div className="section-header">Headlines</div>
                        <table>
                            <thead>
                                <tr><th style={{ width: 50 }}>Time</th><th style={{ width: 80 }}>Source</th><th>Headline</th></tr>
                            </thead>
                            <tbody>
                                {home.headlines.map((h, idx) => (
                                    <tr key={idx}>
                                        <td className="mono muted">{String(h.published || '').slice(11, 16)}</td>
                                        <td style={{ fontWeight: 600, color: 'var(--link)' }}>{h.source || ''}</td>
                                        <td>
                                            <a href={h.url} target="_blank" rel="noreferrer">
                                                {h.title}
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <aside className={`watchlist-sidebar ${watchlistCollapsed ? 'collapsed' : ''}`}>
                <div className="card" style={{ padding: 10 }}>
                    <div className="card-header" style={{ marginBottom: 6 }}>
                        <span>Watchlist</span>
                        <div className="row" style={{ gap: 6 }}>
                            {!watchlistCollapsed && <span className="tag">{watchlistCountLabel}</span>}
                            <button
                                className="btn"
                                onClick={() => setWatchlistCollapsed((v) => !v)}
                                aria-label={watchlistCollapsed ? 'Expand watchlist sidebar' : 'Collapse watchlist sidebar'}
                            >
                                {watchlistCollapsed ? '>' : '<'}
                            </button>
                        </div>
                    </div>

                    {!watchlistCollapsed && (
                        <>
                            <div className="row" style={{ marginBottom: 8 }}>
                                <input
                                    className="input"
                                    style={{ flex: 1 }}
                                    value={watchlistInput}
                                    onChange={(e) => setWatchlistInput(e.target.value)}
                                    placeholder="Add symbol (e.g. AMD)"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') addWatchlistSymbol();
                                    }}
                                />
                                <button
                                    className="btn primary"
                                    onClick={addWatchlistSymbol}
                                    disabled={!normalizeSymbol(watchlistInput) || watchlistSymbols.length >= MAX_WATCHLIST_SIZE}
                                >
                                    Add
                                </button>
                            </div>

                            {watchlistLoading && (
                                <div style={{ marginBottom: 8 }}>
                                    <span className="muted">Refreshing watchlist...</span>
                                </div>
                            )}

                            {watchlistSymbols.length === 0 ? (
                                <div className="muted">No symbols. Add one to start tracking.</div>
                            ) : (
                                <div className="watchlist-list">
                                    {watchlistSymbols.map((symbol) => {
                                        const item = watchlistData[symbol] || {};
                                        const quote = item.quote || null;
                                        const news = Array.isArray(item.news) ? item.news : [];
                                        const chg = Number(quote?.change_percent) || 0;
                                        return (
                                            <div key={symbol} className="watchlist-item">
                                                <div className="watchlist-item-header">
                                                    <button className="btn" onClick={() => go(symbol)}>{symbol}</button>
                                                    <button className="btn" onClick={() => removeWatchlistSymbol(symbol)}>x</button>
                                                </div>
                                                <div className="watchlist-quote">
                                                    {quote ? (
                                                        <>
                                                            <span className="mono">${Number(quote.price || 0).toFixed(2)}</span>
                                                            <span className={`mono ${chg >= 0 ? 'pos' : 'neg'}`}>
                                                                {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <span className="muted">{item.error || 'Unavailable'}</span>
                                                    )}
                                                </div>
                                                <div className="watchlist-news">
                                                    {news.length === 0 ? (
                                                        <div className="muted">No news</div>
                                                    ) : (
                                                        news.map((n, idx) => (
                                                            <a
                                                                key={`${symbol}-news-${idx}`}
                                                                href={n.url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="watchlist-news-link"
                                                            >
                                                                <span>{n.title}</span>
                                                                <span className="mono muted">{String(n.published || '').slice(11, 16)}</span>
                                                            </a>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </aside>
        </div>
    );
}

export default Dashboard;
