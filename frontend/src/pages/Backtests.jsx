import { useMemo, useState } from 'react';
import api from '../services/api';
import { LoadingSpinner, SimpleBarChart, SimpleLineChart } from '../components';

const STRATEGIES = [
    { value: 'sma_crossover', label: 'SMA Crossover (20/50)' },
    { value: 'rsi_mean_reversion', label: 'RSI Mean Reversion' },
    { value: 'macd_trend', label: 'MACD Trend Following' },
];

function Backtests() {
    const [symbol, setSymbol] = useState('SPY');
    const [strategy, setStrategy] = useState('sma_crossover');
    const [capital, setCapital] = useState('10000');
    const [startDate, setStartDate] = useState('2023-01-01');
    const [endDate, setEndDate] = useState('2025-12-31');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const run = async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const res = await api.backtest.run({
                symbol: symbol.toUpperCase(),
                strategy,
                config: {
                    initial_capital: Number(capital) || 10000,
                    commission: 0,
                    start_date: startDate,
                    end_date: endDate,
                },
            });
            setResult(res.data);
        } catch (e) {
            setError('Backtest failed. Check backend and parameters.');
        } finally {
            setLoading(false);
        }
    };

    // Derive MM-DD date labels from equity_curve when available; fallback to sequential index
    const dailyReturnLabels = useMemo(() => {
        if (!result?.daily_returns?.length) return [];
        if (result.equity_curve?.length > 1)
            return result.equity_curve.slice(1).map((p) => String(p.date || '').slice(5));
        return result.daily_returns.map((_, i) => String(i + 1));
    }, [result]);

    // Sequential trade labels: T1, T2, ...
    const tradePnlLabels = useMemo(() => {
        if (!result?.trade_pnl_series?.length) return [];
        return result.trade_pnl_series.map((_, i) => `T${i + 1}`);
    }, [result]);

    return (
        <div className="container" style={{ padding: '8px 0 20px' }}>
            <div className="section-header">Backtest Configuration</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6, padding: '8px 0', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
                <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>Symbol</div>
                    <input className="input" style={{ width: '100%' }} value={symbol} onChange={(e) => setSymbol(e.target.value)} />
                </div>
                <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>Strategy</div>
                    <select className="input" style={{ width: '100%' }} value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                        {STRATEGIES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>Capital ($)</div>
                    <input className="input" style={{ width: '100%' }} value={capital} onChange={(e) => setCapital(e.target.value)} />
                </div>
                <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>Start Date</div>
                    <input className="input" style={{ width: '100%' }} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>End Date</div>
                    <input className="input" style={{ width: '100%' }} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button className="btn primary" onClick={run} disabled={loading} style={{ width: '100%' }}>
                        {loading ? 'Running...' : 'Run Backtest'}
                    </button>
                </div>
            </div>

            {/* Results */}
            {loading && <LoadingSpinner />}

            {error && (
                <div style={{ color: 'var(--neg)', padding: '10px 0' }}>{error}</div>
            )}

            {result && (
                <>
                    <div className="section-header">Results</div>
                    <div className="kpi-row" style={{ marginBottom: 12 }}>
                        <div className="kpi-item">
                            <span className="kpi-label">Total Return</span>
                            <span className={`kpi-value ${Number(result.total_return_pct) >= 0 ? 'pos' : 'neg'}`}>
                                {result.total_return_pct}%
                            </span>
                        </div>
                        <div className="kpi-item">
                            <span className="kpi-label">Sharpe Ratio</span>
                            <span className="kpi-value">{result.sharpe_ratio}</span>
                        </div>
                        <div className="kpi-item">
                            <span className="kpi-label">Max Drawdown</span>
                            <span className="kpi-value neg">{result.max_drawdown}%</span>
                        </div>
                        <div className="kpi-item">
                            <span className="kpi-label">Win Rate</span>
                            <span className="kpi-value">{result.win_rate}%</span>
                        </div>
                        {result.total_trades != null && (
                            <div className="kpi-item">
                                <span className="kpi-label">Total Trades</span>
                                <span className="kpi-value">{result.total_trades}</span>
                            </div>
                        )}
                    </div>

                    {/* Equity curve */}
                    {result.equity_curve && result.equity_curve.length > 0 && (
                        <>
                            <div className="section-header">Equity Curve</div>
                            <div style={{ border: '1px solid var(--border)', padding: 8, background: 'var(--bg-alt)' }}>
                                <SimpleLineChart
                                    points={result.equity_curve.map((p) => p.equity)}
                                    height={200}
                                />
                            </div>
                        </>
                    )}

                    {Array.isArray(result.daily_returns) && result.daily_returns.length > 0 && (
                        <>
                            <div className="section-header" style={{ marginTop: 12 }}>Daily Return Bars (%)</div>
                            <div style={{ border: '1px solid var(--border)', padding: 8, background: 'var(--bg-alt)' }}>
                                <SimpleBarChart
                                    points={result.daily_returns}
                                    height={120}
                                    centerZero={true}
                                    positiveColor="var(--pos)"
                                    negativeColor="var(--neg)"
                                    labels={dailyReturnLabels}
                                    unit="%"
                                />
                            </div>
                        </>
                    )}

                    {Array.isArray(result.trade_pnl_series) && result.trade_pnl_series.length > 0 && (
                        <>
                            <div className="section-header" style={{ marginTop: 12 }}>Trade P/L Bars ($)</div>
                            <div style={{ border: '1px solid var(--border)', padding: 8, background: 'var(--bg-alt)' }}>
                                <SimpleBarChart
                                    points={result.trade_pnl_series}
                                    height={120}
                                    centerZero={true}
                                    positiveColor="var(--pos)"
                                    negativeColor="var(--neg)"
                                    labels={tradePnlLabels}
                                    unit="$"
                                />
                            </div>
                        </>
                    )}

                    {/* Trades table */}
                    {result.trades && result.trades.length > 0 && (
                        <>
                            <div className="section-header" style={{ marginTop: 12 }}>Trades</div>
                            <div style={{ overflowX: 'auto', maxHeight: 300 }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>No.</th>
                                            <th>Entry Date</th>
                                            <th>Exit Date</th>
                                            <th>Side</th>
                                            <th className="right">Entry</th>
                                            <th className="right">Exit</th>
                                            <th className="right">P/L</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.trades.map((t, i) => {
                                            const pl = Number(t.pnl || t.profit || 0);
                                            return (
                                                <tr key={i}>
                                                    <td className="muted">{i + 1}</td>
                                                    <td className="mono">{t.entry_date || '-'}</td>
                                                    <td className="mono">{t.exit_date || '-'}</td>
                                                    <td>{t.side || 'long'}</td>
                                                    <td className="mono right">${Number(t.entry_price || 0).toFixed(2)}</td>
                                                    <td className="mono right">${Number(t.exit_price || 0).toFixed(2)}</td>
                                                    <td className={`mono right ${pl >= 0 ? 'pos' : 'neg'}`}>
                                                        {pl >= 0 ? '+' : ''}{pl.toFixed(2)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </>
            )}

            {!loading && !result && !error && (
                <div style={{ color: 'var(--muted)', padding: '20px 0', textAlign: 'center' }}>
                    Configure parameters and click "Run Backtest" to see results.
                </div>
            )}
        </div>
    );
}

export default Backtests;
