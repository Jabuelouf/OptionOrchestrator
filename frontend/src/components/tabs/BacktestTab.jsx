import React, { useState } from 'react';
import api from '../../services/api';
import Card from '../Card';
import LoadingSpinner from '../LoadingSpinner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const BacktestTab = ({ symbol }) => {
    const [config, setConfig] = useState({
        initial_capital: 10000,
        commission: 0,
        start_date: '2023-01-01',
    });
    const [strategy, setStrategy] = useState('sma_crossover');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const runBacktest = async () => {
        try {
            setLoading(true);
            const res = await api.backtest.run({
                symbol,
                strategy,
                config
            });
            setResult(res.data);
        } catch (e) {
            console.error("Backtest Error:", e);
            alert("Backtest failed. Check console for details.");
        } finally {
            setLoading(false);
        }
    };

    const handleChangeConfig = (e) => {
        setConfig({ ...config, [e.target.name]: e.target.value });
    };

    return (
        <div className="backtest-tab" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
            <Card title="Backtest Configuration">
                <div className="config-form" style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="form-group">
                        <label>Strategy</label>
                        <select value={strategy} onChange={(e) => setStrategy(e.target.value)} style={{ padding: '8px', borderRadius: '4px' }}>
                            <option value="sma_crossover">SMA Crossover (20/50)</option>
                            {/* <option value="rsi_strategy">RSI Reversal (Pending)</option> */}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Initial Capital</label>
                        <input type="number" name="initial_capital" value={config.initial_capital} onChange={handleChangeConfig} style={{ padding: '8px', borderRadius: '4px' }} />
                    </div>
                    <div className="form-group">
                        <label>Start Date</label>
                        <input type="date" name="start_date" value={config.start_date} onChange={handleChangeConfig} style={{ padding: '8px', borderRadius: '4px' }} />
                    </div>
                    <button onClick={runBacktest} disabled={loading} style={{ padding: '8px 16px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        {loading ? 'Running...' : 'Run Backtest'}
                    </button>
                </div>
            </Card>

            {loading && <LoadingSpinner />}

            {result && (
                <div className="results-container" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
                    <Card title="Performance Metrics">
                        <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div className="metric">
                                <small>Total Return</small>
                                <div style={{ fontSize: '1.4em', color: result.total_return > 0 ? '#4caf50' : '#f44336' }}>
                                    {result.total_return_pct}%
                                </div>
                                <small>(${result.total_return})</small>
                            </div>
                            <div className="metric">
                                <small>Sharpe Ratio</small>
                                <div style={{ fontSize: '1.4em' }}>{result.sharpe_ratio}</div>
                            </div>
                            <div className="metric">
                                <small>Max Drawdown</small>
                                <div style={{ fontSize: '1.4em', color: '#f44336' }}>{result.max_drawdown}%</div>
                            </div>
                            <div className="metric">
                                <small>Win Rate</small>
                                <div style={{ fontSize: '1.4em' }}>{result.win_rate}%</div>
                                <small>({result.winning_trades} / {result.total_trades})</small>
                            </div>
                        </div>
                    </Card>

                    <Card title="Equity Curve">
                        <div style={{ height: '300px', width: '100%' }}>
                            <ResponsiveContainer>
                                <LineChart data={result.equity_curve}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={(str) => new Date(str).toLocaleDateString()}
                                        minTickGap={30}
                                    />
                                    <YAxis domain={['auto', 'auto']} />
                                    <Tooltip
                                        labelFormatter={(str) => new Date(str).toLocaleDateString()}
                                        formatter={(val) => [`$${val.toFixed(2)}`, "Equity"]}
                                    />
                                    <Line type="monotone" dataKey="equity" stroke="var(--primary)" dot={false} strokeWidth={2} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default BacktestTab;
