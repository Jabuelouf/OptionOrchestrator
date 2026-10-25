import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Card, LoadingSpinner } from '../index';

/**
 * Wheel Strategy tab content for StockAnalysis page.
 * 
 * The Wheel is a systematic income strategy:
 * 1. Sell cash-secured puts until assigned
 * 2. If assigned, sell covered calls until called away
 * 3. Repeat
 */
const WheelStrategyTab = ({ symbol, currentPrice }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [phase, setPhase] = useState('cash_secured_put');
    const [objective, setObjective] = useState('balanced');
    const [costBasis, setCostBasis] = useState(0);
    const [analysis, setAnalysis] = useState(null);

    useEffect(() => {
        if (!symbol) return;

        const fetchWheel = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.strategies.getWheel(symbol, {
                    phase: phase,
                    objective: objective,
                    cost_basis: costBasis,
                    min_dte: 21,
                    max_dte: 60
                });
                setAnalysis(res.data);
            } catch (err) {
                console.error("Failed to fetch wheel strategy:", err);
                setError("Failed to load wheel strategy recommendations");
            } finally {
                setLoading(false);
            }
        };

        fetchWheel();
    }, [symbol, phase, objective, costBasis]);

    const formatPercent = (value) => {
        if (value === null || value === undefined) return 'N/A';
        return `${value.toFixed(2)}%`;
    };

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
            {/* Header with controls */}
            <div className="covered-call-header">
                <h2>🎡 Wheel Strategy</h2>
            </div>

            {/* Phase Selector */}
            <div className="objective-selector" style={{ marginBottom: '1rem' }}>
                <label>Current Phase:</label>
                <div className="objective-buttons">
                    <button
                        className={`objective-btn ${phase === 'cash_secured_put' ? 'active' : ''}`}
                        onClick={() => setPhase('cash_secured_put')}
                    >
                        💵 Selling Puts
                    </button>
                    <button
                        className={`objective-btn ${phase === 'covered_call' ? 'active' : ''}`}
                        onClick={() => setPhase('covered_call')}
                    >
                        📈 Selling Calls
                    </button>
                </div>
            </div>

            {/* Objective Selector */}
            <div className="objective-selector" style={{ marginBottom: '1rem' }}>
                <label>Objective:</label>
                <div className="objective-buttons">
                    {['aggressive', 'balanced', 'conservative'].map(obj => (
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

            {/* Cost Basis Input (for covered call phase) */}
            {phase === 'covered_call' && (
                <div className="objective-selector" style={{ marginBottom: '1.5rem' }}>
                    <label>Your Cost Basis:</label>
                    <input
                        type="number"
                        value={costBasis}
                        onChange={(e) => setCostBasis(parseFloat(e.target.value) || 0)}
                        placeholder="Enter your cost per share"
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg-tertiary)',
                            color: 'var(--color-text-primary)',
                            width: '150px',
                            marginLeft: '0.5rem'
                        }}
                    />
                </div>
            )}

            {loading && (
                <div className="covered-call-loading">
                    <LoadingSpinner />
                    <p>Analyzing wheel opportunities...</p>
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
                                <span className="label">Capital Required</span>
                                <span className="value">{formatCurrency(analysis.capital_required)}</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Current Phase</span>
                                <span className="value" style={{ textTransform: 'capitalize' }}>
                                    {phase === 'cash_secured_put' ? '💵 Selling Puts' : '📈 Selling Calls'}
                                </span>
                            </div>
                        </div>
                        {analysis.wheel_summary && (
                            <div className="volatility-info mt-4 pt-4 border-t border-gray-800 text-sm"
                                style={{ color: 'var(--color-primary)' }}>
                                🎡 {analysis.wheel_summary}
                            </div>
                        )}
                        {analysis.volatility_assessment && (
                            <div className="volatility-info mt-2 text-sm text-gray-400">
                                {analysis.volatility_assessment}
                            </div>
                        )}
                    </Card>

                    {/* Best Recommendation Card */}
                    {analysis.recommendation && (
                        <Card>
                            <h3 style={{ marginBottom: '1rem', color: 'var(--color-text-primary)' }}>
                                ⭐ Top Recommendation
                            </h3>
                            <div className="analysis-summary">
                                <div className="summary-item">
                                    <span className="label">Strike</span>
                                    <span className="value">{formatCurrency(analysis.recommendation.recommended_strike.strike)}</span>
                                </div>
                                <div className="summary-item">
                                    <span className="label">Premium</span>
                                    <span className="value text-success">
                                        {formatCurrency(analysis.recommendation.recommended_strike.premium)}
                                    </span>
                                </div>
                                <div className="summary-item">
                                    <span className="label">Annualized Return</span>
                                    <span className="value text-primary">
                                        {formatPercent(analysis.recommendation.recommended_strike.annualized_return)}
                                    </span>
                                </div>
                                <div className="summary-item">
                                    <span className="label">Cushion</span>
                                    <span className="value">
                                        {formatPercent(analysis.recommendation.recommended_strike.cushion)}
                                    </span>
                                </div>
                            </div>
                            <div className="volatility-info mt-4 text-sm">
                                <strong>Rationale:</strong> {analysis.recommendation.recommended_strike.rationale}
                            </div>
                            <div className="volatility-info mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                <strong>Next Phase:</strong> {analysis.recommendation.next_phase_preview}
                            </div>
                        </Card>
                    )}

                    {/* Strike Recommendations Table */}
                    {analysis.recommendation && analysis.recommendation.alternative_strikes && analysis.recommendation.alternative_strikes.length > 0 && (
                        <div className="covered-call-table-container">
                            <h3 style={{ padding: '1rem', margin: 0, borderBottom: '1px solid var(--color-border)' }}>
                                Alternative Strikes
                            </h3>
                            <table className="covered-call-table">
                                <thead>
                                    <tr>
                                        <th>Expiration</th>
                                        <th>DTE</th>
                                        <th>Strike</th>
                                        <th>Premium</th>
                                        <th>Ann. Return</th>
                                        <th>Cushion</th>
                                        <th>Prob. Profit</th>
                                        <th>Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[analysis.recommendation.recommended_strike, ...analysis.recommendation.alternative_strikes].map((strike, idx) => (
                                        <tr key={idx} className={idx === 0 ? 'top-pick' : ''}>
                                            <td>{strike.expiration}</td>
                                            <td>{strike.days_to_expiration}</td>
                                            <td className="strike">{formatCurrency(strike.strike)}</td>
                                            <td className="text-success">{formatCurrency(strike.premium)}</td>
                                            <td className="text-primary">{formatPercent(strike.annualized_return)}</td>
                                            <td>{formatPercent(strike.cushion)}</td>
                                            <td>{formatPercent(strike.probability_of_profit * 100)}</td>
                                            <td>
                                                <span className="score-badge" style={{ background: getScoreColor(strike.score) }}>
                                                    {strike.score?.toFixed(0)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Wheel Explanation */}
                    <div className="objective-info">
                        <h4 style={{ marginBottom: '0.5rem', color: 'var(--color-text-primary)' }}>
                            How The Wheel Works
                        </h4>
                        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '250px' }}>
                                <p style={{ marginBottom: '0.5rem' }}>
                                    <strong>Phase 1: Sell Cash-Secured Puts</strong>
                                </p>
                                <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
                                    <li>Collect premium while waiting to buy stock at a discount</li>
                                    <li>If put expires OTM, keep premium and repeat</li>
                                    <li>If assigned, you now own shares at strike price</li>
                                </ul>
                            </div>
                            <div style={{ flex: 1, minWidth: '250px' }}>
                                <p style={{ marginBottom: '0.5rem' }}>
                                    <strong>Phase 2: Sell Covered Calls</strong>
                                </p>
                                <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
                                    <li>Generate income while holding shares</li>
                                    <li>If call expires OTM, keep premium and repeat</li>
                                    <li>If called away, sell shares at strike + restart wheel</li>
                                </ul>
                            </div>
                        </div>

                        {objective === 'aggressive' && (
                            <p className="mt-2"><strong>Aggressive:</strong> Higher delta strikes for more premium but greater assignment probability.</p>
                        )}
                        {objective === 'balanced' && (
                            <p className="mt-2"><strong>Balanced:</strong> Sweet spot between premium income and assignment risk.</p>
                        )}
                        {objective === 'conservative' && (
                            <p className="mt-2"><strong>Conservative:</strong> Lower delta for less assignment risk, but smaller premiums.</p>
                        )}
                    </div>
                </>
            )}

            {!loading && !error && analysis && !analysis.recommendation && (
                <div className="no-recommendations">
                    <p>No suitable wheel opportunities found for current criteria.</p>
                    <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Try adjusting the objective or check a different expiration.</p>
                </div>
            )}
        </div>
    );
};

export default WheelStrategyTab;
