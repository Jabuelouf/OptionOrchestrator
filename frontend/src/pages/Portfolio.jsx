import { useEffect, useState } from 'react';
import api from '../services/api';
import { LoadingSpinner, PerformanceBar } from '../components';

function Portfolio() {
    const [loading, setLoading] = useState(true);
    const [positions, setPositions] = useState([]);
    const [varLoading, setVarLoading] = useState(false);
    const [varData, setVarData] = useState(null);

    // Alerts (moved from standalone page)
    const [alertsLoading, setAlertsLoading] = useState(true);
    const [alerts, setAlerts] = useState([]);
    const [symbol, setSymbol] = useState('SPY');
    const [metric, setMetric] = useState('price');
    const [operator, setOperator] = useState('gt');
    const [threshold, setThreshold] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true);
            try {
                const res = await api.portfolio.getAll();
                if (alive) setPositions(res.data || []);
            } catch (e) {
                if (alive) setPositions([]);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    const loadAlerts = async () => {
        setAlertsLoading(true);
        try {
            const res = await api.alerts.getAll();
            const dict = res.data || {};
            setAlerts(Object.values(dict));
        } catch (e) {
            setAlerts([]);
        } finally {
            setAlertsLoading(false);
        }
    };

    useEffect(() => { loadAlerts(); }, []);

    const loadVar = async () => {
        setVarLoading(true);
        try {
            const res = await api.portfolio.getVaR();
            setVarData(res.data);
        } catch (e) {
            setVarData(null);
        } finally {
            setVarLoading(false);
        }
    };

    const createAlert = async () => {
        if (!threshold) return;
        setCreating(true);
        try {
            await api.alerts.create({
                symbol: symbol.toUpperCase(),
                name: `${symbol.toUpperCase()} ${metric} ${operator} ${threshold}`,
                metric, operator,
                threshold: Number(threshold),
            });
            setThreshold('');
            await loadAlerts();
        } finally {
            setCreating(false);
        }
    };

    const delAlert = async (id) => {
        await api.alerts.delete(id);
        await loadAlerts();
    };

    return (
        <div className="container" style={{ padding: '8px 0 20px' }}>
            {/* Positions */}
            <div className="section-header">Positions</div>

            {loading ? (
                <LoadingSpinner />
            ) : positions.length === 0 ? (
                <div style={{ color: 'var(--muted)', padding: '10px 0' }}>No positions. Add positions via the API.</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table>
                        <thead>
                            <tr>
                                <th>Symbol</th>
                                <th>Strategy</th>
                                <th>Status</th>
                                <th className="right">Unrealized P/L</th>
                                <th>Bar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {positions.map((p) => {
                                const pl = Number(p.unrealized_pl || 0);
                                return (
                                    <tr key={p.id}>
                                        <td className="mono" style={{ fontWeight: 700 }}>{p.symbol}</td>
                                        <td>{p.strategy_name}</td>
                                        <td>
                                            <span className={`tag`}>{p.status}</span>
                                        </td>
                                        <td className={`mono right ${pl >= 0 ? 'pos' : 'neg'}`}>
                                            {pl >= 0 ? '+' : ''}{pl.toFixed(2)}
                                        </td>
                                        <td><PerformanceBar value={pl} max={500} width={50} label={''} /></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* VaR */}
            <div className="section-header" style={{ marginTop: 16 }}>Risk (VaR)</div>
            <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                <button className="btn" onClick={loadVar} disabled={varLoading}>
                    {varLoading ? 'Loading...' : 'Calculate VaR'}
                </button>
                <span className="muted" style={{ fontSize: 10 }}>On-demand calculation</span>
            </div>

            {varLoading ? (
                <LoadingSpinner />
            ) : varData ? (
                <div className="kpi-row">
                    <div className="kpi-item">
                        <span className="kpi-label">Portfolio Value</span>
                        <span className="kpi-value">${Number(varData.portfolio_value).toFixed(2)}</span>
                    </div>
                    <div className="kpi-item">
                        <span className="kpi-label">VaR 95%</span>
                        <span className="kpi-value neg">${Number(varData.parametric_var_95?.value_at_risk || 0).toFixed(2)}</span>
                    </div>
                    <div className="kpi-item">
                        <span className="kpi-label">VaR 99%</span>
                        <span className="kpi-value neg">${Number(varData.parametric_var_99?.value_at_risk || 0).toFixed(2)}</span>
                    </div>
                </div>
            ) : (
                <div style={{ color: 'var(--muted)', padding: '6px 0' }}>Not calculated.</div>
            )}

            {/* Alerts section */}
            <div className="section-header" style={{ marginTop: 16 }}>Alerts</div>
            <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
                <input className="input" style={{ width: 80 }} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Symbol" />
                <select className="input" style={{ width: 90 }} value={metric} onChange={(e) => setMetric(e.target.value)}>
                    <option value="price">price</option>
                    <option value="rsi_14">rsi_14</option>
                    <option value="volume">volume</option>
                </select>
                <select className="input" style={{ width: 60 }} value={operator} onChange={(e) => setOperator(e.target.value)}>
                    <option value="gt">&gt;</option>
                    <option value="lt">&lt;</option>
                    <option value="eq">=</option>
                </select>
                <input className="input" style={{ width: 80 }} value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="value" />
                <button className="btn primary" onClick={createAlert} disabled={creating || !threshold}>
                    {creating ? 'Adding...' : 'Add'}
                </button>
                <div className="spacer" />
                <button className="btn" onClick={loadAlerts} disabled={alertsLoading}>Refresh</button>
            </div>

            {alertsLoading ? (
                <LoadingSpinner />
            ) : alerts.length === 0 ? (
                <div style={{ color: 'var(--muted)', padding: '6px 0' }}>No alerts configured.</div>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th>Symbol</th>
                            <th>Metric</th>
                            <th>Op</th>
                            <th className="right">Threshold</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {alerts.map((a) => (
                            <tr key={a.id}>
                                <td className="mono" style={{ fontWeight: 700 }}>{a.symbol}</td>
                                <td>{a.condition?.metric}</td>
                                <td className="mono">{a.condition?.operator}</td>
                                <td className="mono right">{a.condition?.threshold}</td>
                                <td>
                                    <button className="btn" onClick={() => delAlert(a.id)}>Del</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

export default Portfolio;
