import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Card, LoadingSpinner } from '../index';

/**
 * Ratio Spread tab component.
 * WARNING: Ratio spreads have unlimited risk on one side.
 */
const RatioSpreadTab = ({ symbol, currentPrice }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [ratioType, setRatioType] = useState('call_ratio');
    const [spreadWidth, setSpreadWidth] = useState(5);
    const [analysis, setAnalysis] = useState(null);

    useEffect(() => {
        if (!symbol) return;

        const fetchRatioSpreads = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.strategies.getRatioSpreads(symbol, {
                    ratio_type: ratioType,
                    spread_width: spreadWidth
                });
                setAnalysis(res.data);
            } catch (err) {
                console.error("Failed to fetch ratio spreads:", err);
                setError("Failed to load ratio spread recommendations");
            } finally {
                setLoading(false);
            }
        };

        fetchRatioSpreads();
    }, [symbol, ratioType, spreadWidth]);

    const formatCurrency = (value) => {
        if (value === null || value === undefined) return 'N/A';
        return `$${value.toFixed(2)}`;
    };

    const getScoreColor = (score) => {
        if (score >= 80) return 'var(--color-success)';
        if (score >= 60) return 'var(--color-primary)';
        if (score >= 40) return 'var(--color-warning)';
        return 'var(--color-danger)';
    };

    return (
        <div className="covered-call-tab">
            <div className="covered-call-header">
                <h2>⚖️ Ratio Spreads</h2>
            </div>

            {/* Risk Warning */}
            <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid var(--color-danger)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                marginBottom: '1rem'
            }}>
                <strong style={{ color: 'var(--color-danger)' }}>⚠️ UNLIMITED RISK WARNING</strong>
                <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                    Ratio spreads have unlimited loss potential on the naked side.
                    Only use if you fully understand the risks.
                </p>
            </div>

            {/* Type Selector */}
            <div className="objective-selector" style={{ marginBottom: '1rem' }}>
                <label>Ratio Type:</label>
                <div className="objective-buttons">
                    <button
                        className={`objective-btn ${ratioType === 'call_ratio' ? 'active' : ''}`}
                        onClick={() => setRatioType('call_ratio')}
                    >
                        📈 Call Ratio (1:2)
                    </button>
                    <button
                        className={`objective-btn ${ratioType === 'put_ratio' ? 'active' : ''}`}
                        onClick={() => setRatioType('put_ratio')}
                    >
                        📉 Put Ratio (1:2)
                    </button>
                </div>
            </div>

            {/* Width Selector */}
            <div className="objective-selector" style={{ marginBottom: '1.5rem' }}>
                <label>Spread Width:</label>
                <div className="objective-buttons">
                    {[5, 10, 15].map(width => (
                        <button
                            key={width}
                            className={`objective-btn ${spreadWidth === width ? 'active' : ''}`}
                            onClick={() => setSpreadWidth(width)}
                        >
                            ${width}
                        </button>
                    ))}
                </div>
            </div>

            {loading && (
                <div className="covered-call-loading">
                    <LoadingSpinner />
                    <p>Analyzing ratio spreads...</p>
                </div>
            )}

            {error && (
                <div className="covered-call-error">
                    <p>{error}</p>
                </div>
            )}

            {!loading && !error && analysis && (
                <>
                    {/* Summary Card */}
                    <Card>
                        <div className="analysis-summary">
                            <div className="summary-item">
                                <span className="label">Stock Price</span>
                                <span className="value">{formatCurrency(currentPrice)}</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Strategy</span>
                                <span className="value" style={{ textTransform: 'capitalize' }}>
                                    {ratioType.replace('_', ' ')} 1:2
                                </span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Found</span>
                                <span className="value">{analysis.recommendations?.length || 0} opportunities</span>
                            </div>
                        </div>
                        {analysis.volatility_assessment && (
                            <div className="volatility-info mt-4 pt-4 border-t border-gray-800 text-sm"
                                style={{ color: 'var(--color-primary)' }}>
                                📊 {analysis.volatility_assessment}
                            </div>
                        )}
                    </Card>

                    {/* Recommendations Table */}
                    {analysis.recommendations && analysis.recommendations.length > 0 ? (
                        <div className="covered-call-table-container">
                            <table className="covered-call-table">
                                <thead>
                                    <tr>
                                        <th>Expiration</th>
                                        <th>Buy</th>
                                        <th>Sell</th>
                                        <th>Credit/Debit</th>
                                        <th>Max Profit</th>
                                        <th>Limited Loss</th>
                                        <th>Unlimited Side</th>
                                        <th>Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analysis.recommendations.map((rec, idx) => (
                                        <tr key={idx} className={idx === 0 ? 'top-pick' : ''}>
                                            <td>
                                                <div>{rec.expiration}</div>
                                                <div className="text-gray-400 text-xs">{rec.days_to_expiration} DTE</div>
                                            </td>
                                            <td>
                                                <div>{rec.long_quantity}x ${rec.long_strike}</div>
                                                <div className="text-gray-400 text-xs">@ {formatCurrency(rec.long_premium)}</div>
                                            </td>
                                            <td>
                                                <div>{rec.short_quantity}x ${rec.short_strike}</div>
                                                <div className="text-gray-400 text-xs">@ {formatCurrency(rec.short_premium)}</div>
                                            </td>
                                            <td className={rec.net_credit > 0 ? 'text-success' : 'text-danger'}>
                                                {formatCurrency(Math.abs(rec.net_credit))} {rec.net_credit > 0 ? 'credit' : 'debit'}
                                            </td>
                                            <td className="text-success">{formatCurrency(rec.max_profit)}</td>
                                            <td>{formatCurrency(rec.max_loss_limited)}</td>
                                            <td style={{ color: 'var(--color-danger)' }}>{rec.unlimited_risk_side}</td>
                                            <td>
                                                <span className="score-badge" style={{ background: getScoreColor(rec.score) }}>
                                                    {rec.score?.toFixed(0)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="no-recommendations">
                            <p>No ratio spread opportunities found.</p>
                        </div>
                    )}

                    {/* Strategy Explanation */}
                    <div className="objective-info">
                        <h4 style={{ marginBottom: '0.5rem', color: 'var(--color-text-primary)' }}>
                            How Ratio Spreads Work
                        </h4>
                        {ratioType === 'call_ratio' ? (
                            <div>
                                <p><strong>Call Ratio (1:2):</strong> Buy 1 lower call, Sell 2 higher calls</p>
                                <ul style={{ marginLeft: '1.5rem' }}>
                                    <li>Often entered for credit or small debit</li>
                                    <li>Max profit at short strike at expiration</li>
                                    <li><strong style={{ color: 'var(--color-danger)' }}>UNLIMITED LOSS above upper breakeven</strong></li>
                                    <li>Best for neutral-to-moderately-bullish outlook</li>
                                </ul>
                            </div>
                        ) : (
                            <div>
                                <p><strong>Put Ratio (1:2):</strong> Buy 1 higher put, Sell 2 lower puts</p>
                                <ul style={{ marginLeft: '1.5rem' }}>
                                    <li>Often entered for credit or small debit</li>
                                    <li>Max profit at short strike at expiration</li>
                                    <li><strong style={{ color: 'var(--color-danger)' }}>UNLIMITED LOSS below lower breakeven</strong></li>
                                    <li>Best for neutral-to-moderately-bearish outlook</li>
                                </ul>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default RatioSpreadTab;
