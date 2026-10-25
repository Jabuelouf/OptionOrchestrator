import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Card, LoadingSpinner } from '../index';

/**
 * Straddle/Strangle tab content for StockAnalysis page.
 * Shows volatility strategies - long for expected big moves, short for range-bound.
 */
const StraddleStrangleTab = ({ symbol, currentPrice: _currentPrice }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [strategyType, setStrategyType] = useState('long_straddle');
    const [analysis, setAnalysis] = useState(null);

    const strategyTypes = [
        { id: 'long_straddle', label: 'Long Straddle', direction: 'long', description: 'Profit from large moves either direction' },
        { id: 'long_strangle', label: 'Long Strangle', direction: 'long', description: 'Cheaper, needs larger move' },
        { id: 'short_straddle', label: 'Short Straddle', direction: 'short', description: 'Profit from no movement (HIGH RISK)' },
        { id: 'short_strangle', label: 'Short Strangle', direction: 'short', description: 'Profit from range-bound (HIGH RISK)' }
    ];

    useEffect(() => {
        if (!symbol) return;

        const fetchStrategies = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.strategies.getStraddlesStrangles(symbol, {
                    strategy_type: strategyType,
                    min_dte: 14,
                    max_dte: 60
                });
                setAnalysis(res.data);
            } catch (err) {
                console.error("Failed to fetch straddle/strangle:", err);
                setError("Failed to load strategy recommendations");
            } finally {
                setLoading(false);
            }
        };

        fetchStrategies();
    }, [symbol, strategyType]);

    const formatCurrency = (value) => {
        if (value === null || value === undefined) return 'N/A';
        return `$${value.toFixed(2)}`;
    };

    const isLong = strategyType.startsWith('long_');
    const currentStrategy = strategyTypes.find(t => t.id === strategyType);

    return (
        <div className="straddle-tab">
            <div className="straddle-header">
                <h2>Volatility Strategies</h2>
                <div className="strategy-type-grid">
                    {strategyTypes.map(type => (
                        <button
                            key={type.id}
                            className={`straddle-type-btn ${strategyType === type.id ? 'active' : ''} ${type.direction}`}
                            onClick={() => setStrategyType(type.id)}
                            title={type.description}
                        >
                            {type.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Strategy Description */}
            <div className="straddle-description">
                {isLong ? (
                    <span className="straddle-tag debit">DEBIT STRATEGY</span>
                ) : (
                    <>
                        <span className="straddle-tag credit">CREDIT STRATEGY</span>
                        <span className="straddle-tag danger">⚠ UNLIMITED RISK</span>
                    </>
                )}
                {currentStrategy?.description}
            </div>

            {loading && (
                <div className="straddle-loading">
                    <LoadingSpinner />
                    <p>Analyzing volatility strategies...</p>
                </div>
            )}

            {error && (
                <div className="straddle-error">
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
                                    color: isLong
                                        ? ((analysis.iv_rank || 50) < 30 ? 'var(--color-success)' : 'var(--color-warning)')
                                        : ((analysis.iv_rank || 50) > 50 ? 'var(--color-success)' : 'var(--color-warning)')
                                }}>
                                    {analysis.iv_rank?.toFixed(1) || 'N/A'}
                                </span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Recommendations</span>
                                <span className="value">{analysis.recommendations?.length || 0}</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Best For</span>
                                <span className="value">{isLong ? 'Low IV' : 'High IV'}</span>
                            </div>
                        </div>
                    </Card>

                    {/* Recommendations Table */}
                    {analysis.recommendations && analysis.recommendations.length > 0 ? (
                        <div className="straddle-table-container">
                            <table className="straddle-table">
                                <thead>
                                    <tr>
                                        <th>Expiration</th>
                                        <th>DTE</th>
                                        <th>Strike(s)</th>
                                        <th>{isLong ? 'Total Cost' : 'Total Credit'}</th>
                                        <th>Max Profit</th>
                                        <th>Max Loss</th>
                                        <th>Breakevens</th>
                                        <th>Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analysis.recommendations.map((rec, idx) => (
                                        <tr key={idx} className={idx === 0 ? 'top-pick' : ''}>
                                            <td>{rec.expiration || 'N/A'}</td>
                                            <td>{rec.days_to_expiration || 'N/A'}</td>
                                            <td className="strikes">
                                                {rec.call_strike === rec.put_strike
                                                    ? formatCurrency(rec.call_strike)
                                                    : `${formatCurrency(rec.put_strike)} / ${formatCurrency(rec.call_strike)}`
                                                }
                                            </td>
                                            <td className={isLong ? 'text-danger' : 'text-success'}>
                                                {formatCurrency(rec.total_premium)}
                                            </td>
                                            <td className="text-success">
                                                {rec.max_profit === null || rec.max_profit === 'unlimited'
                                                    ? 'Unlimited'
                                                    : formatCurrency(rec.max_profit)}
                                            </td>
                                            <td className="text-danger">
                                                {rec.max_loss === null || rec.max_loss === 'unlimited'
                                                    ? 'Unlimited'
                                                    : formatCurrency(rec.max_loss)}
                                            </td>
                                            <td className="breakevens">
                                                {formatCurrency(rec.lower_breakeven)} / {formatCurrency(rec.upper_breakeven)}
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
                            <p>No recommendations found. {isLong ? 'IV may be too high for buying volatility.' : 'IV may be too low for selling volatility.'}</p>
                        </div>
                    )}

                    {/* Strategy Info */}
                    <div className={`straddle-info ${!isLong ? 'warning' : ''}`}>
                        {strategyType === 'long_straddle' && (
                            <p><strong>Long Straddle:</strong> Buy ATM call + ATM put. Profits when stock moves significantly either direction. Max loss = premium paid.</p>
                        )}
                        {strategyType === 'long_strangle' && (
                            <p><strong>Long Strangle:</strong> Buy OTM call + OTM put. Cheaper than straddle but needs larger move to profit. Max loss = premium paid.</p>
                        )}
                        {strategyType === 'short_straddle' && (
                            <p><strong>⚠ Short Straddle:</strong> Sell ATM call + ATM put. Profits when stock stays near strike. <strong>UNLIMITED LOSS POTENTIAL</strong> if stock moves significantly.</p>
                        )}
                        {strategyType === 'short_strangle' && (
                            <p><strong>⚠ Short Strangle:</strong> Sell OTM call + OTM put. Profits when stock stays between strikes. <strong>UNLIMITED LOSS POTENTIAL</strong> if stock moves past breakevens.</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default StraddleStrangleTab;
