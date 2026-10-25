import { useEffect, useState } from 'react';
import api from '../services/api';
import { Card, LoadingSpinner } from '../components';

function Alerts() {
    const [loading, setLoading] = useState(true);
    const [alerts, setAlerts] = useState([]);
    const [symbol, setSymbol] = useState('SPY');
    const [metric, setMetric] = useState('price');
    const [operator, setOperator] = useState('gt');
    const [threshold, setThreshold] = useState('');
    const [creating, setCreating] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await api.alerts.getAll();
            const dict = res.data || {};
            setAlerts(Object.values(dict));
        } catch (e) {
            setAlerts([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const create = async () => {
        if (!threshold) return;
        setCreating(true);
        try {
            await api.alerts.create({
                symbol: symbol.toUpperCase(),
                name: `${symbol.toUpperCase()} ${metric} ${operator} ${threshold}`,
                metric,
                operator,
                threshold: Number(threshold),
            });
            setThreshold('');
            await load();
        } finally {
            setCreating(false);
        }
    };

    const del = async (id) => {
        await api.alerts.delete(id);
        await load();
    };

    return (
        <div className="container" style={{ padding: '20px 0' }}>
            <Card title="Alerts">
                <div className="row wrap" style={{ gap: 10 }}>
                    <input className="input" style={{ maxWidth: 120 }} value={symbol} onChange={(e) => setSymbol(e.target.value)} />
                    <select className="input" style={{ maxWidth: 160 }} value={metric} onChange={(e) => setMetric(e.target.value)}>
                        <option value="price">price</option>
                        <option value="rsi_14">rsi_14</option>
                        <option value="volume">volume</option>
                    </select>
                    <select className="input" style={{ maxWidth: 120 }} value={operator} onChange={(e) => setOperator(e.target.value)}>
                        <option value="gt">gt</option>
                        <option value="lt">lt</option>
                        <option value="eq">eq</option>
                    </select>
                    <input className="input" style={{ maxWidth: 140 }} value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="threshold" />
                    <button className="btn primary" onClick={create} disabled={creating || !threshold}>
                        {creating ? 'Creating…' : 'Create'}
                    </button>
                    <div className="spacer" />
                    <button className="btn" onClick={load} disabled={loading}>Refresh</button>
                </div>
            </Card>

            <div style={{ height: 12 }} />

            <Card title={`Active (${alerts.length})`}>
                {loading ? (
                    <LoadingSpinner />
                ) : alerts.length === 0 ? (
                    <div style={{ color: 'var(--muted)', fontSize: 14 }}>No alerts.</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                            <thead>
                                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                                    <th style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Symbol</th>
                                    <th style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Metric</th>
                                    <th style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Op</th>
                                    <th style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Threshold</th>
                                    <th style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {alerts.map((a) => (
                                    <tr key={a.id}>
                                        <td className="mono" style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>{a.symbol}</td>
                                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>{a.condition?.metric}</td>
                                        <td className="mono" style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>{a.condition?.operator}</td>
                                        <td className="mono" style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>{a.condition?.threshold}</td>
                                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                                            <button className="btn" onClick={() => del(a.id)}>Delete</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
}

export default Alerts;

