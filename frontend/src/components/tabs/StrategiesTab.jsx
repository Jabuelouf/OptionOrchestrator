import React, { useState } from 'react';
import { StrategyList, ComparisonModal } from '../index';

/**
 * Strategies tab content for StockAnalysis page.
 * Shows AI-recommended trading strategies.
 */
const StrategiesTab = ({ strategies, currentPrice }) => {
    const [selectedStrategies, setSelectedStrategies] = useState([]);
    const [showComparison, setShowComparison] = useState(false);

    const handleSelectStrategy = (strategy) => {
        setSelectedStrategies(prev => {
            if (prev.includes(strategy)) {
                return prev.filter(s => s !== strategy);
            }
            if (prev.length >= 3) {
                alert("You can compare up to 3 strategies at a time.");
                return prev;
            }
            return [...prev, strategy];
        });
    };

    return (
        <div className="strategies-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0 }}>AI Recommended Strategies</h2>

                {selectedStrategies.length > 0 && (
                    <button
                        className="btn-primary"
                        onClick={() => setShowComparison(true)}
                    >
                        Compare Selected ({selectedStrategies.length})
                    </button>
                )}
            </div>

            {strategies ? (
                <StrategyList
                    strategies={strategies.strategies}
                    currentPrice={currentPrice}
                    onSelectStrategy={handleSelectStrategy}
                    selectedStrategies={selectedStrategies}
                />
            ) : (
                <p>Loading strategies...</p>
            )}

            {showComparison && (
                <ComparisonModal
                    strategies={selectedStrategies}
                    currentPrice={currentPrice}
                    onClose={() => setShowComparison(false)}
                />
            )}
        </div>
    );
};

export default StrategiesTab;
