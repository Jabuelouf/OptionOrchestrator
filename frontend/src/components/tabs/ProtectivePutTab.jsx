import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Card, LoadingSpinner } from '../index';

/**
 * Protective Put tab content for StockAnalysis page.
 * Shows protective put (married put) recommendations for hedging stock positions.
 */
const ProtectivePutTab = ({ symbol, currentPrice }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [protectionLevel, setProtectionLevel] = useState('moderate');
    const [shares, setShares] = useState(100);
    const [analysis, setAnalysis] = useState(null);

    useEffect(() => {
        if (!symbol) return;

        const fetchProtectivePuts = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.strategies.getProtectivePuts(symbol, {
                    protection_level: protectionLevel,
                    shares: shares,
                    min_dte: 14,
                    max_dte: 90
                });
                setAnalysis(res.data);
            } catch (err) {
                console.error("Failed to fetch protective puts:", err);
                setError("Failed to load protective put recommendations");
            } finally {
                setLoading(false);
            }
        };

        fetchProtectivePuts();
    }, [symbol, protectionLevel, shares]);

    const formatPercent = (value) => {
        if (value === null || value === undefined) return 'N/A';
        return `${value.toFixed(2)}%`;
    };

    const formatCurrency = (value) => {
        if (value === null || value === undefined) return 'N/A';
        return `$${value.toFixed(2)}`;
    };

    const getProtectionLevelColor = (level) => {
        if (level <= 5) return 'var(--color-success)';
        if (level <= 10) return 'var(--color-warning)';
        return 'var(--color-danger)';
    };

    return (
        <div className="covered-call-tab">
            {/* Header with controls */}
            <div className="covered-call-header">
                <h2>Protective Put (Stock Insurance)</h2>

                {/* Shares selector */}
                <div className="objective-selector" style={{ marginBottom: '1rem' }}>
                    <label>Shares to Protect:</label>
                    <div className="objective-buttons">
                        {[100, 200, 500, 1000].map(num => (
                            <button
                                key={num}
                                className={`objective-btn ${shares === num ? 'active' : ''}`}
                                onClick={() => setShares(num)}
                            >
                                {num}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Protection level selector */}
                <div className="objective-selector">
                    <label>Protection Level:</label>
                    <div className="objective-buttons">
                        {['aggressive', 'moderate', 'conservative'].map(level => (
                            <button
                                key={level}
                                className={`objective-btn ${protectionLevel === level ? 'active' : ''}`}
                                onClick={() => setProtectionLevel(level)}
                            >
                                {level.charAt(0).toUpperCase() + level.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {loading && (
                <div className="covered-call-loading">
                    <LoadingSpinner />
                    <p>Analyzing protective put options...</p>
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
                                <span className="label">Shares Covered</span>
                                <span className="value">{analysis.shares_to_protect}</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Unprotected Value</span>
                                <span className="value">{formatCurrency(currentPrice * shares)}</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Recommendations</span>
                                <span className="value">{analysis.recommendations?.length || 0}</span>
                            </div>
                        </div>
                        {analysis.summary && (
                            <div className="volatility-info mt-4 pt-4 border-t border-gray-800 text-sm"
                                style={{ color: 'var(--color-primary)' }}>
                                📊 {analysis.summary}
                            </div>
                        )}
                        {analysis.volatility_assessment && (
                            <div className="volatility-info mt-2 text-sm text-gray-400">
                                {analysis.volatility_assessment}
                            </div>
                        )}
                    </Card>

                    {/* Risk Comparison Card */}
                    <Card>
                        <h3 style={{ marginBottom: '1rem', color: 'var(--color-text-primary)' }}>
                            Risk Comparison
                        </h3>
                        <div className="analysis-summary">
                            <div className="summary-item">
                                <span className="label">Without Protection</span>
                                <span className="value text-danger">
                                    Max Loss: {formatCurrency(currentPrice * shares)}
                                </span>
                            </div>
                            {analysis.recommendations && analysis.recommendations.length > 0 && (
                                <div className="summary-item">
                                    <span className="label">With Best Protection</span>
                                    <span className="value text-success">
                                        Max Loss: {formatCurrency(analysis.recommendations[0].max_loss_total)}
                                    </span>
                                </div>
                            )}
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
                                        <th>Strike (Floor)</th>
                                        <th>Protection %</th>
                                        <th>Premium</th>
                                        <th>Total Cost</th>
                                        <th>Max Loss</th>
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
                                            <td style={{ color: getProtectionLevelColor(rec.protection_level) }}>
                                                {formatPercent(rec.protection_level)} below
                                            </td>
                                            <td className="text-gray-200">{formatCurrency(rec.premium)}/sh</td>
                                            <td className="text-danger">{formatCurrency(rec.total_cost)}</td>
                                            <td className="text-warning">{formatCurrency(rec.max_loss_total)}</td>
                                            <td className="text-gray-200">{formatCurrency(rec.breakeven)}</td>
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
                            <p>No protective put opportunities found for current criteria.</p>
                        </div>
                    )}

                    {/* Explanation Card */}
                    <div className="objective-info">
                        <h4 style={{ marginBottom: '0.5rem', color: 'var(--color-text-primary)' }}>
                            How Protective Puts Work
                        </h4>
                        <p style={{ marginBottom: '0.5rem' }}>
                            A protective put is like <strong>insurance</strong> for your stock. You own shares and buy a put option to limit your downside.
                        </p>
                        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
                            <li>If stock falls below strike, you can sell at the strike price</li>
                            <li>Max loss = (Stock Price - Strike) + Premium paid</li>
                            <li>Upside remains unlimited (minus premium cost)</li>
                        </ul>

                        {protectionLevel === 'aggressive' && (
                            <p><strong>Aggressive:</strong> Cheap put options far below current price. Only protects against large drops.</p>
                        )}
                        {protectionLevel === 'moderate' && (
                            <p><strong>Moderate:</strong> Balanced protection at reasonable cost. Good for normal hedging.</p>
                        )}
                        {protectionLevel === 'conservative' && (
                            <p><strong>Conservative:</strong> Near-ATM puts for maximum protection. Higher cost but minimal gap.</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default ProtectivePutTab;
