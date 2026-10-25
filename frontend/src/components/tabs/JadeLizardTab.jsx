import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Card, LoadingSpinner } from '../index';

/**
 * Jade Lizard tab content for StockAnalysis page.
 * Shows Jade Lizard recommendations (Short Put + Short Call Spread).
 */
const JadeLizardTab = ({ symbol, currentPrice: _currentPrice }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [analysis, setAnalysis] = useState(null);

    useEffect(() => {
        if (!symbol) return;

        const fetchJadeLizards = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.strategies.getJadeLizards(symbol);
                setAnalysis(res.data);
            } catch (err) {
                console.error("Failed to fetch jade lizards:", err);
                setError("Failed to load jade lizard recommendations");
            } finally {
                setLoading(false);
            }
        };

        fetchJadeLizards();
    }, [symbol]);

    const formatCurrency = (value) => {
        if (value === null || value === undefined) return 'N/A';
        return `$${value.toFixed(2)}`;
    };

    return (
        <div className="jade-lizard-tab">
            <div className="strategy-header">
                <h2>Jade Lizard Opportunities</h2>
                <div className="strategy-meta">
                    <span className="strategy-tag credit">CREDIT STRATEGY</span>
                    <span className="strategy-tag bullish">NEUTRAL / BULLISH</span>
                </div>
            </div>

            <div className="strategy-description">
                <p>
                    <strong>Jade Lizard:</strong> Sell an OTM Put and a Bear Call Spread.
                    Collect enough credit to eliminate upside risk if the stock rallies.
                    <strong>Ideally: Total Credit &gt; Call Spread Width = No Upside Risk.</strong>
                </p>
            </div>

            {loading && (
                <div className="loading-state">
                    <LoadingSpinner />
                    <p>Scanning for Jade Lizard opportunities...</p>
                </div>
            )}

            {error && (
                <div className="error-state">
                    <p>{error}</p>
                </div>
            )}

            {!loading && !error && analysis && (
                <>
                    <Card>
                        <div className="analysis-summary">
                            <div className="summary-item">
                                <span className="label">Start Date</span>
                                <span className="value">{new Date(analysis.analysis_date).toLocaleDateString()}</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">IV Rank</span>
                                <span className="value" style={{
                                    color: (analysis.iv_rank || 0) > 50 ? 'var(--color-success)' : 'var(--color-warning)'
                                }}>
                                    {analysis.iv_rank?.toFixed(1) || 'N/A'}
                                </span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Market Assessment</span>
                                <span className="value">{analysis.market_assessment}</span>
                            </div>
                        </div>
                    </Card>

                    {analysis.recommendations && analysis.recommendations.length > 0 ? (
                        <div className="table-container">
                            <table className="strategy-table">
                                <thead>
                                    <tr>
                                        <th>Expiration</th>
                                        <th>Short Put</th>
                                        <th>Call Spread</th>
                                        <th>Credit</th>
                                        <th>No Upside Risk</th>
                                        <th>Max Loss</th>
                                        <th>Breakeven (Down)</th>
                                        <th>Return (Ann.)</th>
                                        <th>Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analysis.recommendations.map((rec, idx) => (
                                        <tr key={idx} className={idx === 0 ? 'top-pick' : ''}>
                                            <td>
                                                <div className="date-cell">
                                                    <span className="date">{rec.expiration}</span>
                                                    <span className="dte">{rec.days_to_expiration}d</span>
                                                </div>
                                            </td>
                                            <td className="strike-cell">
                                                {formatCurrency(rec.short_put.strike)}
                                            </td>
                                            <td className="strike-cell">
                                                -{formatCurrency(rec.short_call.strike)} / +{formatCurrency(rec.long_call.strike)}
                                                <div className="spread-width text-muted">
                                                    Width: {formatCurrency(rec.call_spread_width / 100)}
                                                </div>
                                            </td>
                                            <td className="text-success font-bold">
                                                {formatCurrency(rec.total_credit)}
                                            </td>
                                            <td>
                                                {!rec.has_upside_risk ? (
                                                    <span className="badge success">YES</span>
                                                ) : (
                                                    <span className="badge warning">NO ({formatCurrency(rec.call_breakeven)})</span>
                                                )}
                                            </td>
                                            <td className="text-danger">
                                                {formatCurrency(rec.max_loss)}
                                            </td>
                                            <td>
                                                {formatCurrency(rec.put_breakeven)}
                                            </td>
                                            <td>
                                                {rec.annualized_return.toFixed(1)}%
                                            </td>
                                            <td>
                                                <div className="score-container">
                                                    <span className="score-value">{rec.score}</span>
                                                    <div className="score-bar-bg">
                                                        <div
                                                            className="score-bar-fill"
                                                            style={{
                                                                width: `${rec.score}%`,
                                                                backgroundColor: rec.score >= 70 ? 'var(--color-success)' : 'var(--color-primary)'
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="no-data-message">
                            No Jade Lizard opportunities found matching criteria.
                            Try checking standard Vertical Spreads or waiting for higher volatility.
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default JadeLizardTab;
