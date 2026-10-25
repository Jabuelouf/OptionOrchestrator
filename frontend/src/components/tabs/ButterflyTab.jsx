import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Card, LoadingSpinner } from '../index';

/**
 * Butterfly Spread tab content for StockAnalysis page.
 * Shows butterfly spread recommendations (long call, long put, iron butterfly).
 */
const ButterflyTab = ({ symbol, currentPrice }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [butterflyType, setButterflyType] = useState('long_call');
    const [wingWidth, setWingWidth] = useState(5);
    const [analysis, setAnalysis] = useState(null);

    useEffect(() => {
        if (!symbol) return;

        const fetchButterfly = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.strategies.getButterfly(symbol, {
                    butterfly_type: butterflyType,
                    wing_width: wingWidth,
                    min_dte: 14,
                    max_dte: 60
                });
                setAnalysis(res.data);
            } catch (err) {
                console.error("Failed to fetch butterfly:", err);
                setError("Failed to load butterfly recommendations");
            } finally {
                setLoading(false);
            }
        };

        fetchButterfly();
    }, [symbol, butterflyType, wingWidth]);

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

    const getTypeLabel = (type) => {
        switch (type) {
            case 'long_call': return '📈 Long Call Butterfly';
            case 'long_put': return '📉 Long Put Butterfly';
            case 'iron': return '🦋 Iron Butterfly';
            default: return type;
        }
    };

    return (
        <div className="covered-call-tab">
            {/* Header */}
            <div className="covered-call-header">
                <h2>🦋 Butterfly Spreads</h2>
            </div>

            {/* Type Selector */}
            <div className="objective-selector" style={{ marginBottom: '1rem' }}>
                <label>Butterfly Type:</label>
                <div className="objective-buttons">
                    <button
                        className={`objective-btn ${butterflyType === 'long_call' ? 'active' : ''}`}
                        onClick={() => setButterflyType('long_call')}
                    >
                        📈 Long Call
                    </button>
                    <button
                        className={`objective-btn ${butterflyType === 'long_put' ? 'active' : ''}`}
                        onClick={() => setButterflyType('long_put')}
                    >
                        📉 Long Put
                    </button>
                    <button
                        className={`objective-btn ${butterflyType === 'iron' ? 'active' : ''}`}
                        onClick={() => setButterflyType('iron')}
                    >
                        🦋 Iron
                    </button>
                </div>
            </div>

            {/* Wing Width Selector */}
            <div className="objective-selector" style={{ marginBottom: '1.5rem' }}>
                <label>Wing Width:</label>
                <div className="objective-buttons">
                    {[2.5, 5, 10, 15].map(width => (
                        <button
                            key={width}
                            className={`objective-btn ${wingWidth === width ? 'active' : ''}`}
                            onClick={() => setWingWidth(width)}
                        >
                            ${width}
                        </button>
                    ))}
                </div>
            </div>

            {loading && (
                <div className="covered-call-loading">
                    <LoadingSpinner />
                    <p>Analyzing butterfly spreads...</p>
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
                                <span className="value">{getTypeLabel(butterflyType)}</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Wing Width</span>
                                <span className="value">{formatCurrency(wingWidth)}</span>
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

                    {/* Recommendations */}
                    {analysis.recommendations && analysis.recommendations.length > 0 ? (
                        <div className="covered-call-table-container">
                            <table className="covered-call-table">
                                <thead>
                                    <tr>
                                        <th>Expiration</th>
                                        <th>Strikes</th>
                                        <th>Cost/Credit</th>
                                        <th>Max Profit</th>
                                        <th>Max Loss</th>
                                        <th>Profit Zone</th>
                                        <th>R:R</th>
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
                                            <td className="strike">
                                                <div>${rec.lower_strike} / ${rec.middle_strike} / ${rec.upper_strike}</div>
                                                <div className="text-gray-400 text-xs">${rec.wing_width} wide</div>
                                            </td>
                                            <td>
                                                {rec.net_debit > 0 ? (
                                                    <span className="text-danger">{formatCurrency(rec.net_debit)} debit</span>
                                                ) : (
                                                    <span className="text-success">{formatCurrency(rec.net_credit)} credit</span>
                                                )}
                                            </td>
                                            <td className="text-success">{formatCurrency(rec.max_profit)}</td>
                                            <td className="text-danger">{formatCurrency(rec.max_loss)}</td>
                                            <td>
                                                <div>{formatCurrency(rec.lower_breakeven)} - {formatCurrency(rec.upper_breakeven)}</div>
                                                <div className="text-gray-400 text-xs">${rec.profit_zone_width} range</div>
                                            </td>
                                            <td>{rec.risk_reward_ratio}:1</td>
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
                            <p>No butterfly opportunities found for current criteria.</p>
                        </div>
                    )}

                    {/* Best Pick Details */}
                    {analysis.recommendations && analysis.recommendations.length > 0 && (
                        <Card>
                            <h3 style={{ marginBottom: '1rem', color: 'var(--color-text-primary)' }}>
                                ⭐ Top Recommendation
                            </h3>
                            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                                {analysis.recommendations[0].rationale}
                            </p>
                        </Card>
                    )}

                    {/* Strategy Explanation */}
                    <div className="objective-info">
                        <h4 style={{ marginBottom: '0.5rem', color: 'var(--color-text-primary)' }}>
                            How Butterfly Spreads Work
                        </h4>
                        <p style={{ marginBottom: '0.5rem' }}>
                            A butterfly is a <strong>neutral strategy</strong> that profits when the stock stays near the middle strike at expiration.
                        </p>

                        {butterflyType === 'long_call' && (
                            <div>
                                <p><strong>Long Call Butterfly:</strong></p>
                                <ul style={{ marginLeft: '1.5rem' }}>
                                    <li>Buy 1 lower call, Sell 2 middle calls, Buy 1 upper call</li>
                                    <li>Pay a small debit to enter</li>
                                    <li>Max profit if stock at middle strike at expiration</li>
                                    <li>Best in low IV environments (options are cheap)</li>
                                </ul>
                            </div>
                        )}
                        {butterflyType === 'long_put' && (
                            <div>
                                <p><strong>Long Put Butterfly:</strong></p>
                                <ul style={{ marginLeft: '1.5rem' }}>
                                    <li>Buy 1 lower put, Sell 2 middle puts, Buy 1 upper put</li>
                                    <li>Same payoff as call butterfly</li>
                                    <li>May have better pricing in certain situations</li>
                                </ul>
                            </div>
                        )}
                        {butterflyType === 'iron' && (
                            <div>
                                <p><strong>Iron Butterfly:</strong></p>
                                <ul style={{ marginLeft: '1.5rem' }}>
                                    <li>Sell ATM straddle + Buy OTM strangle wings</li>
                                    <li>Receive credit to enter</li>
                                    <li>Max profit if stock at middle strike</li>
                                    <li>Best in high IV environments (sell expensive premium)</li>
                                </ul>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default ButterflyTab;
