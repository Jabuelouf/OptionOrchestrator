import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Card, LoadingSpinner } from '../index';

/**
 * Time Spread (Calendar & Diagonal) tab component.
 */
const TimeSpreadTab = ({ symbol, currentPrice }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [spreadType, setSpreadType] = useState('calendar_call');
    const [analysis, setAnalysis] = useState(null);

    useEffect(() => {
        if (!symbol) return;

        const fetchTimeSpreads = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.strategies.getTimeSpreads(symbol, {
                    spread_type: spreadType
                });
                setAnalysis(res.data);
            } catch (err) {
                console.error("Failed to fetch time spreads:", err);
                setError("Failed to load time spread recommendations");
            } finally {
                setLoading(false);
            }
        };

        fetchTimeSpreads();
    }, [symbol, spreadType]);

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
                <h2>📅 Calendar & Diagonal Spreads</h2>
            </div>

            {/* Type Selector */}
            <div className="objective-selector" style={{ marginBottom: '1.5rem' }}>
                <label>Spread Type:</label>
                <div className="objective-buttons">
                    <button
                        className={`objective-btn ${spreadType === 'calendar_call' ? 'active' : ''}`}
                        onClick={() => setSpreadType('calendar_call')}
                    >
                        📅 Call Calendar
                    </button>
                    <button
                        className={`objective-btn ${spreadType === 'calendar_put' ? 'active' : ''}`}
                        onClick={() => setSpreadType('calendar_put')}
                    >
                        📅 Put Calendar
                    </button>
                    <button
                        className={`objective-btn ${spreadType === 'diagonal_call' ? 'active' : ''}`}
                        onClick={() => setSpreadType('diagonal_call')}
                    >
                        ↗️ Bullish Diagonal
                    </button>
                    <button
                        className={`objective-btn ${spreadType === 'diagonal_put' ? 'active' : ''}`}
                        onClick={() => setSpreadType('diagonal_put')}
                    >
                        ↘️ Bearish Diagonal
                    </button>
                </div>
            </div>

            {loading && (
                <div className="covered-call-loading">
                    <LoadingSpinner />
                    <p>Analyzing time spreads...</p>
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
                                    {spreadType.replace('_', ' ')}
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
                                        <th>Front Month</th>
                                        <th>Back Month</th>
                                        <th>Net Debit</th>
                                        <th>Theta Adv.</th>
                                        <th>Vega Exp.</th>
                                        <th>Max Loss</th>
                                        <th>Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analysis.recommendations.map((rec, idx) => (
                                        <tr key={idx} className={idx === 0 ? 'top-pick' : ''}>
                                            <td>
                                                <div>${rec.front_strike} ({rec.front_dte}d)</div>
                                                <div className="text-gray-400 text-xs">Sell @ {formatCurrency(rec.front_premium)}</div>
                                            </td>
                                            <td>
                                                <div>${rec.back_strike} ({rec.back_dte}d)</div>
                                                <div className="text-gray-400 text-xs">Buy @ {formatCurrency(rec.back_premium)}</div>
                                            </td>
                                            <td className="text-danger">{formatCurrency(rec.net_debit)}</td>
                                            <td className={rec.theta_advantage > 0 ? 'text-success' : ''}>
                                                {rec.theta_advantage > 0 ? '+' : ''}{rec.theta_advantage?.toFixed(3)}
                                            </td>
                                            <td className={rec.vega_exposure > 0 ? 'text-primary' : ''}>
                                                {rec.vega_exposure > 0 ? '+' : ''}{rec.vega_exposure?.toFixed(3)}
                                            </td>
                                            <td>{formatCurrency(rec.max_loss)}</td>
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
                            <p>No time spread opportunities found.</p>
                        </div>
                    )}

                    {/* Strategy Explanation */}
                    <div className="objective-info">
                        <h4 style={{ marginBottom: '0.5rem', color: 'var(--color-text-primary)' }}>
                            How Time Spreads Work
                        </h4>
                        {spreadType.includes('calendar') ? (
                            <div>
                                <p><strong>Calendar Spread:</strong> Same strike, different expirations</p>
                                <ul style={{ marginLeft: '1.5rem' }}>
                                    <li>Sell near-term option, buy longer-term option</li>
                                    <li>Profits from faster time decay of short option</li>
                                    <li>Best when expecting stock to stay near strike</li>
                                    <li>Benefits from IV rise in back month</li>
                                </ul>
                            </div>
                        ) : (
                            <div>
                                <p><strong>Diagonal Spread:</strong> Different strikes AND expirations</p>
                                <ul style={{ marginLeft: '1.5rem' }}>
                                    <li>Combines calendar spread with directional bias</li>
                                    <li>Bullish diagonal: expects moderate upward move</li>
                                    <li>Bearish diagonal: expects moderate downward move</li>
                                    <li>More flexible but complex risk profile</li>
                                </ul>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default TimeSpreadTab;
