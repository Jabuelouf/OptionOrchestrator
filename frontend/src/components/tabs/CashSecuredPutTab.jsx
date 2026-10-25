import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Card, LoadingSpinner } from '../index';

/**
 * Cash-Secured Put tab content for StockAnalysis page.
 * Shows CSP recommendations with objective filtering.
 */
const CashSecuredPutTab = ({ symbol, currentPrice }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [objective, setObjective] = useState('balanced');
    const [analysis, setAnalysis] = useState(null);

    useEffect(() => {
        if (!symbol) return;

        const fetchCashSecuredPuts = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.strategies.getCashSecuredPuts(symbol, {
                    objective: objective,
                    min_dte: 14,
                    max_dte: 60
                });
                setAnalysis(res.data);
            } catch (err) {
                console.error("Failed to fetch cash-secured puts:", err);
                setError("Failed to load cash-secured put recommendations");
            } finally {
                setLoading(false);
            }
        };

        fetchCashSecuredPuts();
    }, [symbol, objective]);

    const formatPercent = (value) => {
        if (value === null || value === undefined) return 'N/A';
        return `${value.toFixed(2)}%`;
    };

    const formatCurrency = (value) => {
        if (value === null || value === undefined) return 'N/A';
        return `$${value.toFixed(2)}`;
    };

    return (
        <div className="covered-call-tab">
            {/* Reusing covered-call-tab styles for consistency */}
            <div className="covered-call-header">
                <h2>Cash-Secured Put Opportunities</h2>
                <div className="objective-selector">
                    <label>Objective:</label>
                    <div className="objective-buttons">
                        {['income', 'balanced', 'acquisition'].map(obj => (
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
                    <p>Analyzing cash-secured put opportunities...</p>
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
                                <span className="label">Analysis Date</span>
                                <span className="value">{new Date(analysis.analysis_date).toLocaleDateString()}</span>
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
                        {analysis.volatility_assessment && (
                            <div className="volatility-info mt-4 pt-4 border-t border-gray-800 text-sm text-gray-400">
                                {analysis.volatility_assessment}
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
                                        <th>DTE</th>
                                        <th>Strike</th>
                                        <th>Premium</th>
                                        <th>Cost Basis</th>
                                        <th>Ann. Return</th>
                                        <th>Protection</th>
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
                                            <td className="text-gray-200">{formatCurrency(rec.cost_basis_if_assigned)}</td>
                                            <td className="return">{formatPercent(rec.annualized_return)}</td>
                                            <td>{formatPercent(rec.downside_protection)}</td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <span className="score-badge" style={{
                                                        background: rec.score >= 80 ? 'var(--color-success)' :
                                                            rec.score >= 60 ? 'var(--color-primary)' :
                                                                'var(--color-warning)'
                                                    }}>
                                                        {rec.score?.toFixed(0)}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="no-recommendations">
                            <p>No cash-secured put opportunities found for current criteria.</p>
                        </div>
                    )}

                    {/* Goal Description */}
                    <div className="objective-info">
                        {objective === 'income' && (
                            <p><strong>Income Objective:</strong> Focuses on generating the most premium while maintaining a high probability of NOT being assigned the stock.</p>
                        )}
                        {objective === 'balanced' && (
                            <p><strong>Balanced Objective:</strong> A middle-ground approach seeking decent income with a reasonable discount if assigned.</p>
                        )}
                        {objective === 'acquisition' && (
                            <p><strong>Acquisition Objective:</strong> Focuses on obtaining the stock at a discount to current price. Higher strikes, more aggressive target entry.</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default CashSecuredPutTab;
