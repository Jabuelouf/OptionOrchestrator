import React, { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import Card from './Card';
import LoadingSpinner from './LoadingSpinner';

const PortfolioAnalysis = ({ positions }) => {
    const [correlation, setCorrelation] = useState(null);
    const [varMetrics, setVarMetrics] = useState(null);
    const [loading, setLoading] = useState(false);
    const [activeVarMethod, setActiveVarMethod] = useState('parametric');

    const fetchAnalysis = useCallback(async () => {
        setLoading(true);
        try {
            const symbols = [...new Set(positions.map(p => p.symbol))];

            // Only fetch correlation if > 1 symbol
            if (symbols.length > 1) {
                const corrRes = await api.portfolio.getCorrelation();
                setCorrelation(corrRes.data);
            } else {
                setCorrelation(null);
            }

            const varRes = await api.portfolio.getVaR();
            setVarMetrics(varRes.data);

        } catch (e) {
            console.error("Analysis fetch error:", e);
        } finally {
            setLoading(false);
        }
    }, [positions]);

    useEffect(() => {
        if (positions && positions.length > 0) {
            fetchAnalysis();
        }
    }, [positions, fetchAnalysis]);

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}><LoadingSpinner /></div>;
    if (!correlation && !varMetrics) return null;

    const getVarDisplay = (method) => {
        if (!varMetrics) return null;
        const var95 = varMetrics[`${method}_var_95`];
        const var99 = varMetrics[`${method}_var_99`];

        return (
            <div className="var-display">
                <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
                    <div className="metric">
                        <small style={{ color: 'var(--text-secondary)' }}>95% Confidence</small>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-danger)' }}>
                            ${var95?.value_at_risk.toFixed(2)}
                        </div>
                        <small style={{ color: 'var(--text-secondary)' }}>{var95?.value_at_risk_pct.toFixed(2)}% of Portfolio</small>
                    </div>
                    <div className="metric">
                        <small style={{ color: 'var(--text-secondary)' }}>99% Confidence</small>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#8b0000' }}>
                            ${var99?.value_at_risk.toFixed(2)}
                        </div>
                        <small style={{ color: 'var(--text-secondary)' }}>{var99?.value_at_risk_pct.toFixed(2)}% of Portfolio</small>
                    </div>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                    * Based on historical volatility and current position sizes (1-day horizon).
                </p>
            </div>
        );
    };

    return (
        <div className="portfolio-analysis" style={{ marginTop: '2rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>Advanced Risk Analytics</h2>

            <div className="grid-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
                {varMetrics && (
                    <Card title="Value at Risk (VaR)">
                        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
                            {['parametric', 'historical', 'monte_carlo'].map(method => (
                                varMetrics[`${method}_var_95`] && (
                                    <button
                                        key={method}
                                        onClick={() => setActiveVarMethod(method)}
                                        className={`btn-secondary ${activeVarMethod === method ? 'active' : ''}`}
                                        style={{
                                            padding: '4px 12px',
                                            fontSize: '0.8rem',
                                            backgroundColor: activeVarMethod === method ? 'var(--bg-tertiary)' : 'transparent',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {method.replace('_', ' ').toUpperCase()}
                                    </button>
                                )
                            ))}
                        </div>
                        {getVarDisplay(activeVarMethod)}
                    </Card>
                )}

                {correlation && (
                    <Card title="Portfolio Correlation Matrix">
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}></th>
                                        {correlation.matrix.symbols.map(s => (
                                            <th key={s} style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>{s}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {correlation.matrix.values.map((row, i) => (
                                        <tr key={i}>
                                            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                                                {correlation.matrix.symbols[i]}
                                            </th>
                                            {row.map((val, j) => (
                                                <td key={j} style={{
                                                    padding: '0.75rem',
                                                    textAlign: 'center',
                                                    borderBottom: '1px solid var(--border-color)',
                                                    backgroundColor: `rgba(var(--primary-rgb, 0, 120, 215), ${Math.abs(val) * 0.4})`,
                                                    color: Math.abs(val) > 0.7 ? 'white' : 'inherit',
                                                    fontWeight: Math.abs(val) > 0.7 ? 'bold' : 'normal'
                                                }}>
                                                    {val.toFixed(2)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ marginTop: '1rem' }}>
                            <small style={{ color: 'var(--text-secondary)' }}>
                                <strong>Diversification Score:</strong> {correlation.diversification_score.toFixed(1)}/100
                            </small>
                        </div>
                    </Card>
                )}
            </div>

            <style>{`
                .btn-secondary:hover {
                    background-color: var(--bg-tertiary);
                }
                .btn-secondary.active {
                    border-color: var(--color-primary);
                    color: var(--color-primary);
                }
            `}</style>
        </div>
    );
};

export default PortfolioAnalysis;
