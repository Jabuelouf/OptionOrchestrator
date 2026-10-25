import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Card, LoadingSpinner } from '../index';

/**
 * Covered Call tab content for StockAnalysis page.
 * Shows covered call recommendations with objective filtering.
 */
const CoveredCallTab = ({ symbol, currentPrice }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [objective, setObjective] = useState('balanced');
    const [analysis, setAnalysis] = useState(null);

    useEffect(() => {
        if (!symbol) return;

        const fetchCoveredCalls = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.strategies.getCoveredCalls(symbol, {
                    objective: objective,
                    min_dte: 14,
                    max_dte: 60
                });
                setAnalysis(res.data);
            } catch (err) {
                console.error("Failed to fetch covered calls:", err);
                setError("Failed to load covered call recommendations");
            } finally {
                setLoading(false);
            }
        };

        fetchCoveredCalls();
    }, [symbol, objective]);

    const formatPercent = (value) => {
        if (value === null || value === undefined) return 'N/A';
        return `${(value * 100).toFixed(2)}%`;
    };

    const formatCurrency = (value) => {
        if (value === null || value === undefined) return 'N/A';
        return `$${value.toFixed(2)}`;
    };

    return (
        <div className="covered-call-tab">
            <div className="covered-call-header">
                <h2>Covered Call Opportunities</h2>
                <div className="objective-selector">
                    <label>Objective:</label>
                    <div className="objective-buttons">
                        {['income', 'balanced', 'growth'].map(obj => (
                            <button
                                key={obj}
                                className={`objective-btn ${objective === obj ? 'active' : ''}`}
                                onClick={() => setObjective(obj)}
                            >
                                {obj.charAt(0).toUpperCase() + obj.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {loading && (
                <div className="covered-call-loading">
                    <LoadingSpinner />
                    <p>Analyzing covered call opportunities...</p>
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
                                <span className="label">IV Rank</span>
                                <span className="value">{analysis.iv_rank?.toFixed(1) || 'N/A'}</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Recommendations</span>
                                <span className="value">{analysis.recommendations?.length || 0}</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Current Price</span>
                                <span className="value">{formatCurrency(currentPrice)}</span>
                            </div>
                        </div>
                    </Card>

                    {/* Recommendations Table */}
                    {analysis.recommendations && analysis.recommendations.length > 0 ? (
                        <div className="covered-call-table-container">
                            <table className="covered-call-table">
                                <thead>
                                    <tr>
                                        <th>Expiration</th>
                                        <th>DTE</th>
                                        <th>Strike</th>
                                        <th>Premium</th>
                                        <th>Max Profit</th>
                                        <th>Return %</th>
                                        <th>Breakeven</th>
                                        <th>Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analysis.recommendations.map((rec, idx) => (
                                        <tr key={idx} className={idx === 0 ? 'top-pick' : ''}>
                                            <td>{rec.expiration || 'N/A'}</td>
                                            <td>{rec.days_to_expiration || 'N/A'}</td>
                                            <td className="strike">{formatCurrency(rec.strike)}</td>
                                            <td className="premium text-success">{formatCurrency(rec.premium)}</td>
                                            <td className="text-success">{formatCurrency(rec.max_profit)}</td>
                                            <td className="return">{formatPercent(rec.return_on_capital)}</td>
                                            <td>{formatCurrency(rec.breakeven)}</td>
                                            <td>
                                                <span className="score-badge" style={{
                                                    background: rec.score >= 80 ? 'var(--color-success)' :
                                                        rec.score >= 60 ? 'var(--color-primary)' :
                                                            'var(--color-warning)'
                                                }}>
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
                            <p>No covered call opportunities found for current criteria.</p>
                        </div>
                    )}

                    {/* Objective Description */}
                    <div className="objective-info">
                        {objective === 'income' && (
                            <p><strong>Income Objective:</strong> Focuses on maximizing premium income with higher probability of options expiring worthless. Lower strike prices, closer expirations.</p>
                        )}
                        {objective === 'balanced' && (
                            <p><strong>Balanced Objective:</strong> Balances premium income with potential stock appreciation. Moderate strike prices and expirations.</p>
                        )}
                        {objective === 'growth' && (
                            <p><strong>Growth Objective:</strong> Allows for stock appreciation while generating some premium. Higher strike prices, later expirations.</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default CoveredCallTab;
