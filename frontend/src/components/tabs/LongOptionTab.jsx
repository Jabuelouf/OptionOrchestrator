import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Card, LoadingSpinner } from '../index';

/**
 * Long Option tab content for StockAnalysis page.
 * Shows long call and long put recommendations with objective filtering.
 */
const LongOptionTab = ({ symbol, currentPrice }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [optionType, setOptionType] = useState('call');
    const [objective, setObjective] = useState('balanced');
    const [analysis, setAnalysis] = useState(null);

    useEffect(() => {
        if (!symbol) return;

        const fetchLongOptions = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.strategies.getLongOptions(symbol, {
                    option_type: optionType,
                    objective: objective,
                    min_dte: 14,
                    max_dte: 90
                });
                setAnalysis(res.data);
            } catch (err) {
                console.error("Failed to fetch long options:", err);
                setError("Failed to load long option recommendations");
            } finally {
                setLoading(false);
            }
        };

        fetchLongOptions();
    }, [symbol, optionType, objective]);

    const formatDelta = (value) => {
        if (value === null || value === undefined) return 'N/A';
        return value.toFixed(3);
    };

    const formatCurrency = (value) => {
        if (value === null || value === undefined) return 'N/A';
        return `$${value.toFixed(2)}`;
    };

    const getMoneynessClass = (moneyness) => {
        switch (moneyness) {
            case 'ITM': return 'moneyness-itm';
            case 'ATM': return 'moneyness-atm';
            case 'OTM': return 'moneyness-otm';
            default: return '';
        }
    };

    return (
        <div className="covered-call-tab">
            {/* Reusing covered-call-tab styles for consistency */}
            <div className="covered-call-header">
                <h2>Long {optionType === 'call' ? 'Call' : 'Put'} Opportunities</h2>

                {/* Option Type Selector */}
                <div className="objective-selector" style={{ marginBottom: '1rem' }}>
                    <label>Direction:</label>
                    <div className="objective-buttons">
                        <button
                            className={`objective-btn ${optionType === 'call' ? 'active' : ''}`}
                            onClick={() => setOptionType('call')}
                        >
                            📈 Calls (Bullish)
                        </button>
                        <button
                            className={`objective-btn ${optionType === 'put' ? 'active' : ''}`}
                            onClick={() => setOptionType('put')}
                        >
                            📉 Puts (Bearish)
                        </button>
                    </div>
                </div>

                {/* Objective Selector */}
                <div className="objective-selector">
                    <label>Objective:</label>
                    <div className="objective-buttons">
                        {['aggressive', 'balanced', 'speculative'].map(obj => (
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
                    <p>Analyzing long {optionType} opportunities...</p>
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
                                <span className="label">Direction</span>
                                <span className="value" style={{
                                    color: optionType === 'call' ? 'var(--color-success)' : 'var(--color-danger)'
                                }}>
                                    {optionType === 'call' ? '📈 Bullish' : '📉 Bearish'}
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
                                        <th>Moneyness</th>
                                        <th>Premium</th>
                                        <th>Breakeven</th>
                                        <th>Delta</th>
                                        <th>Leverage</th>
                                        <th>Max Loss</th>
                                        <th>Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analysis.recommendations.map((rec, idx) => (
                                        <tr key={idx} className={idx === 0 ? 'top-pick' : ''}>
                                            <td>{rec.expiration || 'N/A'}</td>
                                            <td>{rec.days_to_expiration || 'N/A'}</td>
                                            <td className="strike">{formatCurrency(rec.strike)}</td>
                                            <td>
                                                <span className={`moneyness-badge ${getMoneynessClass(rec.moneyness)}`}>
                                                    {rec.moneyness}
                                                </span>
                                            </td>
                                            <td className="premium">{formatCurrency(rec.premium)}</td>
                                            <td className="text-gray-200">{formatCurrency(rec.breakeven)}</td>
                                            <td>{formatDelta(rec.delta)}</td>
                                            <td className="text-primary">{rec.leverage_ratio}x</td>
                                            <td className="text-danger">{formatCurrency(rec.max_loss)}</td>
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
                            <p>No long {optionType} opportunities found for current criteria.</p>
                        </div>
                    )}

                    {/* Greeks Info for top pick */}
                    {analysis.recommendations && analysis.recommendations.length > 0 && (
                        <Card>
                            <h3 style={{ marginBottom: '1rem', color: 'var(--color-text-primary)' }}>
                                Top Pick Greeks
                            </h3>
                            <div className="analysis-summary">
                                <div className="summary-item">
                                    <span className="label">Delta</span>
                                    <span className="value">{formatDelta(analysis.recommendations[0].delta)}</span>
                                </div>
                                <div className="summary-item">
                                    <span className="label">Gamma</span>
                                    <span className="value">{formatDelta(analysis.recommendations[0].gamma)}</span>
                                </div>
                                <div className="summary-item">
                                    <span className="label">Theta</span>
                                    <span className="value" style={{ color: 'var(--color-danger)' }}>
                                        {formatCurrency(analysis.recommendations[0].theta)}
                                    </span>
                                </div>
                                <div className="summary-item">
                                    <span className="label">Vega</span>
                                    <span className="value">{formatCurrency(analysis.recommendations[0].vega)}</span>
                                </div>
                                <div className="summary-item">
                                    <span className="label">IV</span>
                                    <span className="value">{analysis.recommendations[0].implied_volatility}%</span>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Goal Description */}
                    <div className="objective-info">
                        {objective === 'aggressive' && (
                            <p><strong>Aggressive Objective:</strong> Focuses on ATM/ITM options with high delta exposure. Higher cost but more responsive to price movements. Best for high-conviction, shorter-term trades.</p>
                        )}
                        {objective === 'balanced' && (
                            <p><strong>Balanced Objective:</strong> Targets slightly OTM options for a balance of cost efficiency and leverage. Good all-around choice for directional trades.</p>
                        )}
                        {objective === 'speculative' && (
                            <p><strong>Speculative Objective:</strong> Deep OTM "lottery ticket" options with maximum leverage. Very low probability of profit, but huge potential gains if the stock moves significantly. High risk!</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default LongOptionTab;
