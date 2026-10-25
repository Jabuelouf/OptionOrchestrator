import React from 'react';
import PayoffChart from './PayoffChart';
import api from '../services/api';
import TimeDecayChart from './TimeDecayChart';
import GreeksDisplay from './GreeksDisplay';
import './components.css';

const StrategyCard = ({ strategy, currentPrice, onSelect, isSelected }) => {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [chartView, setChartView] = React.useState('expiry'); // 'expiry' or 'time'
    const [simulationData, setSimulationData] = React.useState(null);
    const [loadingSim, setLoadingSim] = React.useState(false);

    // Determine confidence color
    const getConfidenceColor = (score) => {
        if (score >= 80) return 'var(--color-success)';
        if (score >= 60) return 'var(--color-primary)';
        if (score >= 40) return 'var(--color-warning)';
        return 'var(--color-danger)';
    };

    const toggleExpand = () => setIsExpanded(!isExpanded);

    const handleViewChange = async (view, e) => {
        e.stopPropagation();
        setChartView(view);

        if (view === 'time' && !simulationData) {
            setLoadingSim(true);
            try {
                // Prepare request payload
                const payload = {
                    symbol: strategy.symbol || 'UNKNOWN',
                    current_price: currentPrice,
                    legs: strategy.legs,
                    implied_volatility: 30, // Default, will use leg IVs if available
                    risk_free_rate: 0.05
                };

                const response = await api.strategies.simulatePerformance(payload);
                setSimulationData(response.data.data_points);
            } catch (err) {
                console.error("Failed to load simulation:", err);
            } finally {
                setLoadingSim(false);
            }
        }
    };

    return (
        <div
            className={`strategy-card card slide-in ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected-card' : ''}`}
            onClick={toggleExpand}
            style={{
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                border: isSelected ? '2px solid var(--accent-color)' : ''
            }}
        >
            <div className="strategy-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {onSelect && (
                        <input
                            type="checkbox"
                            checked={isSelected || false}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelect(strategy);
                            }}
                            className="strategy-select-checkbox"
                        />
                    )}
                    <div>
                        <h3 className="strategy-title">{strategy.strategy_name}</h3>
                        <span className="strategy-type">{strategy.strategy_type?.replace(/_/g, ' ').toUpperCase()}</span>
                    </div>
                </div>
                <div className="confidence-badge" style={{ background: getConfidenceColor(strategy.score) }}>
                    {Math.round(strategy.score)}% Match
                </div>
            </div>

            <div className="strategy-body">
                <div className="strategy-metrics">
                    <div className="metric-row">
                        <span>Max Profit</span>
                        <span className="text-success">${strategy.max_profit?.toFixed(2)}</span>
                    </div>
                    <div className="metric-row">
                        <span>Max Loss</span>
                        <span className="text-danger">${strategy.max_loss?.toFixed(2)}</span>
                    </div>
                    <div className="metric-row">
                        <span>Probability</span>
                        <span>{(strategy.probability_of_profit * 100).toFixed(1)}%</span>
                    </div>
                    <div className="metric-row">
                        <span>Risk/Reward</span>
                        <span>1:{strategy.risk_reward_ratio?.toFixed(2)}</span>
                    </div>
                </div>

                {!isExpanded && (
                    <div className="text-center mt-4 text-sm text-gray-500">
                        Click to view payoff diagram & details
                    </div>
                )}

                {isExpanded && (
                    <div className="strategy-details-expanded mt-6 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                        {/* Chart Toggle */}
                        <div className="flex justify-end gap-2 mb-2">
                            <button
                                className={`px-3 py-1 text-xs rounded border transition-colors ${chartView === 'expiry' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}
                                onClick={(e) => handleViewChange('expiry', e)}
                            >
                                At Expiration
                            </button>
                            <button
                                className={`px-3 py-1 text-xs rounded border transition-colors ${chartView === 'time' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}
                                onClick={(e) => handleViewChange('time', e)}
                            >
                                Over Time (Theta)
                            </button>
                        </div>

                        {/* Charts */}
                        <div className="mb-6 bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                            {chartView === 'expiry' ? (
                                <PayoffChart
                                    legs={strategy.legs}
                                    currentPrice={currentPrice}
                                    symbol={strategy.symbol}
                                    expiration={strategy.legs.find(l => l.expiration)?.expiration}
                                />
                            ) : (
                                <TimeDecayChart
                                    data={simulationData}
                                    loading={loadingSim}
                                />
                            )}
                        </div>

                        {/* Greeks Display */}
                        {strategy.greeks && (
                            <GreeksDisplay greeks={strategy.greeks} />
                        )}

                        {/* Legs Table */}
                        <h4 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wider">Strategy Legs</h4>
                        <div className="legs-table-container overflow-x-auto">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="text-gray-500 border-b border-gray-800">
                                        <th className="p-2">Action</th>
                                        <th className="p-2">Qty</th>
                                        <th className="p-2">Expiry</th>
                                        <th className="p-2">Strike</th>
                                        <th className="p-2">Type</th>
                                        <th className="p-2 text-right">Premium</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {strategy.legs.map((leg, idx) => (
                                        <tr key={idx} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                            <td className={`p-2 font-bold ${leg.action === 'buy' ? 'text-success' : 'text-danger'}`}>
                                                {leg.action.toUpperCase()}
                                            </td>
                                            <td className="p-2">{leg.quantity}</td>
                                            <td className="p-2">{leg.option_type === 'stock' ? '-' : (leg.expiration || '-')}</td>
                                            <td className="p-2">{leg.strike ? `$${leg.strike}` : '-'}</td>
                                            <td className="p-2">{leg.option_type?.toUpperCase() || '-'}</td>
                                            <td className="p-2 text-right font-mono">
                                                ${leg.premium?.toFixed(2) || '0.00'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-4 p-3 bg-blue-900/20 border border-blue-900/50 rounded text-sm text-blue-200">
                            <strong>Why this works:</strong> {strategy.market_conditions_fit}
                        </div>
                    </div>
                )}

                {/* 
                <div className="strategy-actions mt-4">
                    <button className="btn-primary" style={{ width: '100%' }} onClick={handleAnalyze}>
                        Analyze Trade
                    </button>
                </div>
                */}
            </div>
        </div>
    );
};

export default StrategyCard;
