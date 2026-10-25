import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import Card from '../Card';
import LoadingSpinner from '../LoadingSpinner';

const AlertsTab = ({ symbol }) => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newAlert, setNewAlert] = useState({
        metric: 'price',
        operator: 'gt',
        threshold: ''
    });
    const [creating, setCreating] = useState(false);

    const fetchAlerts = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.alerts.getAll({ symbol });
            // Filter by symbol manually if API returns all
            // My API `get_alerts_for_symbol` is not exposed as search param in `getAll`?
            // `getAll` calls `GET /alerts`. `AlertsService.get_alerts_for_symbol` is internal or exposed?
            // Checking alerts.py endpoints: 
            // GET /alerts/ -> returns Dict[str, AlertRule]. All alerts.
            // Client side filter for now.
            const allAlerts = Object.values(res.data);
            const symbolAlerts = allAlerts.filter(a => a.symbol === symbol);
            setAlerts(symbolAlerts);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [symbol]);

    useEffect(() => {
        if (symbol) {
            fetchAlerts();
        }
    }, [symbol, fetchAlerts]);

    const handleCreate = async () => {
        if (!newAlert.threshold) return;
        try {
            setCreating(true);
            await api.alerts.create({
                symbol,
                name: `${symbol} ${newAlert.metric} ${newAlert.operator} ${newAlert.threshold}`,
                metric: newAlert.metric,
                operator: newAlert.operator,
                threshold: parseFloat(newAlert.threshold)
            });
            setNewAlert({ ...newAlert, threshold: '' });
            fetchAlerts();
        } catch (e) {
            console.error(e);
            alert("Failed to create alert");
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.alerts.delete(id);
            fetchAlerts();
        } catch (e) {
            console.error(e);
        }
    };

    const getOperatorLabel = (op) => {
        switch (op) {
            case 'gt': return '>';
            case 'lt': return '<';
            case 'eq': return '=';
            default: return op;
        }
    };

    return (
        <div className="alerts-tab" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <Card title="Active Alerts">
                {loading ? <LoadingSpinner /> : (
                    <div className="alerts-list">
                        {alerts.length === 0 ? <p>No active alerts for {symbol}</p> : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '8px' }}>Metric</th>
                                        <th style={{ padding: '8px' }}>Condition</th>
                                        <th style={{ padding: '8px' }}>Status</th>
                                        <th style={{ padding: '8px' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {alerts.map(alert => (
                                        <tr key={alert.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                            <td style={{ padding: '8px' }}>{alert.condition.metric.toUpperCase()}</td>
                                            <td style={{ padding: '8px' }}>
                                                {getOperatorLabel(alert.condition.operator)} {alert.condition.threshold}
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                {alert.is_active ? <span style={{ color: '#4caf50' }}>Active</span> : 'Inactive'}
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                <button onClick={() => handleDelete(alert.id)} style={{ color: '#f44336', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </Card>

            <Card title="Create New Alert">
                <div className="create-form" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div className="form-group">
                        <label>Metric</label>
                        <select
                            value={newAlert.metric}
                            onChange={(e) => setNewAlert({ ...newAlert, metric: e.target.value })}
                            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                        >
                            <option value="price">Price</option>
                            <option value="rsi_14">RSI (14)</option>
                            <option value="volume">Volume</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Operator</label>
                        <select
                            value={newAlert.operator}
                            onChange={(e) => setNewAlert({ ...newAlert, operator: e.target.value })}
                            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                        >
                            <option value="gt">Greater Than ({'>'})</option>
                            <option value="lt">Less Than ({'<'})</option>
                            <option value="eq">Equals (=)</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Threshold</label>
                        <input
                            type="number"
                            value={newAlert.threshold}
                            onChange={(e) => setNewAlert({ ...newAlert, threshold: e.target.value })}
                            placeholder="Value"
                            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                        />
                    </div>
                    <button
                        onClick={handleCreate}
                        disabled={creating || !newAlert.threshold}
                        style={{ padding: '10px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '10px' }}
                    >
                        {creating ? 'Creating...' : 'Create Alert'}
                    </button>
                </div>
            </Card>
        </div>
    );
};

export default AlertsTab;
