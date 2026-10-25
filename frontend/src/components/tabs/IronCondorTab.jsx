import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Card, LoadingSpinner } from '../index';

/**
 * Iron Condor tab content for StockAnalysis page.
 * Shows iron condor recommendations - ideal for high IV, range-bound outlook.
 */
const IronCondorTab = ({ symbol, currentPrice }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [wingWidth, setWingWidth] = useState(5);
    const [analysis, setAnalysis] = useState(null);

    useEffect(() => {
        if (!symbol) return;

        const fetchIronCondors = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.strategies.getIronCondors(symbol, {
                    min_dte: 21,
                    max_dte: 60,
                    wing_width: wingWidth
                });
                setAnalysis(res.data);
            } catch (err) {
                console.error("Failed to fetch iron condors:", err);
                setError("Failed to load iron condor recommendations");
            } finally {
                setLoading(false);
            }
        };

        fetchIronCondors();
    }, [symbol, wingWidth]);

    const formatCurrency = (value) => {
        if (value === null || value === undefined) return 'N/A';
        return `$${value.toFixed(2)}`;
    };

    return (
        <div className="iron-condor-tab">
            <div className="condor-header">
                <h2>Iron Condor Opportunities</h2>
                <div className="wing-selector">
                    <label>Wing Width:</label>
                    <select
                        value={wingWidth}
                        onChange={(e) => setWingWidth(Number(e.target.value))}
                        className="wing-select"
                    >
                        <option value={2.5}>$2.50</option>
                        <option value={5}>$5.00</option>
                        <option value={10}>$10.00</option>
                    </select>
                </div>
            </div>

            {/* Strategy Description */}
            <div className="condor-description">
                <span className="condor-tag credit">CREDIT STRATEGY</span>
                <span className="condor-tag neutral">NEUTRAL OUTLOOK</span>
                Best when IV Rank &gt; 50 and expecting range-bound movement
            </div>

            {loading && (
                <div className="condor-loading">
                    <LoadingSpinner />
                    <p>Analyzing iron condor opportunities...</p>
                </div>
            )}

            {error && (
                <div className="condor-error">
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
                                <span className="value" style={{
                                    color: (analysis.iv_rank || 0) > 50 ? 'var(--color-success)' : 'var(--color-warning)'
                                }}>
                                    {analysis.iv_rank?.toFixed(1) || 'N/A'}
                                </span>
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
                        <div className="condor-table-container">
                            <table className="condor-table">
                                <thead>
                                    <tr>
                                        <th>Expiration</th>
                                        <th>DTE</th>
                                        <th>Put Spread</th>
                                        <th>Call Spread</th>
                                        <th>Credit</th>
                                        <th>Max Profit</th>
                                        <th>Max Loss</th>
                                        <th>Profit Zone</th>
                                        <th>Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analysis.recommendations.map((rec, idx) => (
                                        <tr key={idx} className={idx === 0 ? 'top-pick' : ''}>
                                            <td>{rec.expiration || 'N/A'}</td>
                                            <td>{rec.days_to_expiration || 'N/A'}</td>
                                            <td className="strikes">
                                                {formatCurrency(rec.put_long_strike)}/{formatCurrency(rec.put_short_strike)}
                                            </td>
                                            <td className="strikes">
                                                {formatCurrency(rec.call_short_strike)}/{formatCurrency(rec.call_long_strike)}
                                            </td>
                                            <td className="text-success">{formatCurrency(rec.total_credit)}</td>
                                            <td className="text-success">{formatCurrency(rec.max_profit)}</td>
                                            <td className="text-danger">{formatCurrency(rec.max_loss)}</td>
                                            <td className="profit-zone">
                                                {formatCurrency(rec.lower_breakeven)} - {formatCurrency(rec.upper_breakeven)}
                                            </td>
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
                            <p>No iron condor opportunities found. Consider: IV Rank may be too low for premium selling.</p>
                        </div>
                    )}

                    {/* Strategy Info */}
                    <div className="condor-info">
                        <p><strong>Iron Condor:</strong> Sell OTM put spread + sell OTM call spread. Profits when underlying stays within the short strikes. Maximum profit = total credit received. Maximum loss = wing width - credit.</p>
                    </div>
                </>
            )}
        </div>
    );
};

export default IronCondorTab;
