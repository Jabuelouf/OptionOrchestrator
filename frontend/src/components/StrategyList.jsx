import React from 'react';
import StrategyCard from './StrategyCard';
import './components.css';

const StrategyList = ({ strategies, currentPrice, onSelectStrategy, selectedStrategies = [] }) => {
    if (!strategies || strategies.length === 0) {
        return <div className="no-strategies">No strategies found matching criteria.</div>;
    }

    return (
        <div className="strategy-list grid-layout">
            {strategies.map((strategy, index) => (
                <StrategyCard
                    key={index}
                    strategy={strategy}
                    currentPrice={currentPrice}
                    onSelect={onSelectStrategy}
                    isSelected={selectedStrategies.includes(strategy)}
                />
            ))}
        </div>
    );
};

export default StrategyList;
