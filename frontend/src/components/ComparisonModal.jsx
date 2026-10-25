import React, { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';

const ComparisonModal = ({ strategies, currentPrice, onClose }) => {
    // Generate Payoff Data
    const chartData = useMemo(() => {
        if (!strategies || strategies.length === 0 || !currentPrice) return [];

        const rangePercent = 0.20; // +/- 20%
        const minPrice = currentPrice * (1 - rangePercent);
        const maxPrice = currentPrice * (1 + rangePercent);
        const steps = 40;
        const stepSize = (maxPrice - minPrice) / steps;

        const data = [];

        for (let i = 0; i <= steps; i++) {
            const price = minPrice + (i * stepSize);
            const point = { price: parseFloat(price.toFixed(2)) };

            strategies.forEach((strategy, idx) => {
                let pl = 0;
                strategy.legs.forEach(leg => {
                    const cost = leg.premium || 0;
                    const qty = leg.quantity || 1;
                    const strike = leg.strike;
                    const isLong = leg.action === 'buy';

                    let legValue = 0;
                    if (leg.option_type === 'call') {
                        legValue = Math.max(0, price - strike);
                    } else if (leg.option_type === 'put') {
                        legValue = Math.max(0, strike - price);
                    } else if (leg.option_type === 'stock') {
                        legValue = price; // For stock leg, value is price
                        // For P/L of stock: (price - entry) * qty. But leg structure here makes entry = premium?
                        // Assuming premium in leg for stock is the entry price.
                    }

                    // P/L = (Value - Cost) * 100 * Qty (if Long)
                    // P/L = (Cost - Value) * 100 * Qty (if Short)

                    let legPL = 0;
                    if (leg.option_type === 'stock') {
                        if (isLong) legPL = (price - cost) * qty;
                        else legPL = (cost - price) * qty;
                    } else {
                        if (isLong) legPL = (legValue - cost) * 100 * qty;
                        else legPL = (cost - legValue) * 100 * qty;
                    }
                    pl += legPL;
                });
                point[`strategy_${idx}`] = parseFloat(pl.toFixed(2));
            });
            data.push(point);
        }
        return data;
    }, [strategies, currentPrice]);

    const colors = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6'];

    return (
        <div className="modal-overlay">
            <div className="modal-content card slide-in">
                <div className="modal-header">
                    <h2>Strategy Comparison (Payoff at Expiry)</h2>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div style={{ height: 400, marginTop: '1rem' }}>
                    <ResponsiveContainer>
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis
                                dataKey="price"
                                type="number"
                                domain={['auto', 'auto']}
                                label={{ value: 'Stock Price', position: 'insideBottom', offset: -5 }}
                            />
                            <YAxis label={{ value: 'Profit/Loss ($)', angle: -90, position: 'insideLeft' }} />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                                formatter={(val, name) => {
                                    // Map strategy_idx back to name
                                    const idx = parseInt(name.split('_')[1]);
                                    const strategyName = strategies[idx]?.strategy_name || name;
                                    return [`$${val}`, strategyName];
                                }}
                            />
                            <Legend formatter={(val) => {
                                const idx = parseInt(val.split('_')[1]);
                                return strategies[idx]?.strategy_name || val;
                            }} />
                            <ReferenceLine x={currentPrice} stroke="var(--text-secondary)" strokeDasharray="3 3" label="Current" />
                            <ReferenceLine y={0} stroke="var(--text-secondary)" />

                            {strategies.map((_, idx) => (
                                <Line
                                    key={idx}
                                    type="monotone"
                                    dataKey={`strategy_${idx}`}
                                    stroke={colors[idx % colors.length]}
                                    dot={false}
                                    strokeWidth={2}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <div className="comparison-legend mt-4">
                    {strategies.map((s, idx) => (
                        <div key={idx} className="legend-item" style={{ color: colors[idx % colors.length] }}>
                            <strong>{s.strategy_name}</strong>: {s.strategy_type.replace(/_/g, ' ')}
                            (Score: {Math.round(s.score)}%)
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
                .modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.7);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                }
                .modal-content {
                    width: 90%;
                    max-width: 900px;
                    max-height: 90vh;
                    overflow-y: auto;
                    background: var(--bg-primary);
                }
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid var(--border-color);
                    padding-bottom: 1rem;
                }
                .close-btn {
                    background: none;
                    border: none;
                    font-size: 2rem;
                    color: var(--text-secondary);
                    cursor: pointer;
                }
                .comparison-legend {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 1rem;
                    font-size: 0.9rem;
                }
                .legend-item {
                    border: 1px solid currentColor;
                    padding: 0.5rem;
                    border-radius: 4px;
                }
            `}</style>
        </div>
    );
};

export default ComparisonModal;
