import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Card, LoadingSpinner } from '../index';

/**
 * Vertical Spread tab content for StockAnalysis page.
 * Shows vertical spread recommendations with spread type filtering.
 */
const VerticalSpreadTab = ({ symbol, currentPrice }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [spreadType, setSpreadType] = useState('bull_call');
    const [analysis, setAnalysis] = useState(null);

    const spreadTypes = [
        { id: 'bull_call', label: 'Bull Call', description: 'Debit spread, bullish' },
        { id: 'bear_put', label: 'Bear Put', description: 'Debit spread, bearish' },
        { id: 'bull_put', label: 'Bull Put', description: 'Credit spread, bullish' },
        { id: 'bear_call', label: 'Bear Call', description: 'Credit spread, bearish' }
    ];

    useEffect(() => {
        if (!symbol) return;

        const fetchSpreads = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.strategies.getVerticalSpreads(symbol, {
                    spread_type: spreadType,
                    min_dte: 14,
                    max_dte: 60,
                    min_width: 2,
                    max_width: 10
                });
                setAnalysis(res.data);
            } catch (err) {
                console.error("Failed to fetch vertical spreads:", err);
                setError("Failed to load spread recommendations");
            } finally {
                setLoading(false);
            }
        };

        fetchSpreads();
    }, [symbol, spreadType]);

    const formatCurrency = (value) => {
        if (value === null || value === undefined) return 'N/A';
        return `$${value.toFixed(2)}`;
    };

    const isDebitSpread = spreadType === 'bull_call' || spreadType === 'bear_put';

    return (
        <div className="vertical-spread-tab">
            <div className="spread-header">
                <h2>Vertical Spread Opportunities</h2>
                <div className="spread-type-selector">
                    {spreadTypes.map(type => (
                        <button
                            key={type.id}
                            className={`spread-type-btn ${spreadType === type.id ? 'active' : ''}`}
                            onClick={() => setSpreadType(type.id)}
                            title={type.description}
                        >
                            {type.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Spread Type Description */}
            <div className="spread-description">
                {spreadTypes.find(t => t.id === spreadType)?.description}
                {isDebitSpread ? (
                    <span className="spread-tag debit">DEBIT SPREAD</span>
                ) : (
                    <span className="spread-tag credit">CREDIT SPREAD</span>
                )}
            </div>

            {loading && (
                <div className="spread-loading">
                    <LoadingSpinner />
                    <p>Analyzing spread opportunities...</p>
                </div>
            )}

            {error && (
                <div className="spread-error">
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
                        <div className="spread-table-container">
                            <table className="spread-table">
                                <thead>
                                    <tr>
                                        <th>Expiration</th>
                                        <th>DTE</th>
                                        <th>Long Strike</th>
                                        <th>Short Strike</th>
                                        <th>Width</th>
                                        <th>{isDebitSpread ? 'Debit' : 'Credit'}</th>
                                        <th>Max Profit</th>
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
                                            <td className="strike">{formatCurrency(rec.long_strike)}</td>
                                            <td className="strike">{formatCurrency(rec.short_strike)}</td>
                                            <td>{formatCurrency(rec.width)}</td>
                                            <td className={isDebitSpread ? 'text-danger' : 'text-success'}>
                                                {formatCurrency(rec.net_premium)}
                                            </td>
                                            <td className="text-success">{formatCurrency(rec.max_profit)}</td>
                                            <td className="text-danger">{formatCurrency(rec.max_loss)}</td>
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
                            <p>No spread opportunities found for current criteria.</p>
                        </div>
                    )}

                    {/* Spread Type Info */}
                    <div className="spread-info">
                        {spreadType === 'bull_call' && (
                            <p><strong>Bull Call Spread:</strong> Buy call at lower strike, sell call at higher strike. Profits when stock rises moderately. Limited risk, limited profit.</p>
                        )}
                        {spreadType === 'bear_put' && (
                            <p><strong>Bear Put Spread:</strong> Buy put at higher strike, sell put at lower strike. Profits when stock falls moderately. Limited risk, limited profit.</p>
                        )}
                        {spreadType === 'bull_put' && (
                            <p><strong>Bull Put Spread:</strong> Sell put at higher strike, buy put at lower strike. Profits when stock stays above short strike. Credit received upfront.</p>
                        )}
                        {spreadType === 'bear_call' && (
                            <p><strong>Bear Call Spread:</strong> Sell call at lower strike, buy call at higher strike. Profits when stock stays below short strike. Credit received upfront.</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default VerticalSpreadTab;
