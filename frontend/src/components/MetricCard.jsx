import React from 'react';
import './components.css';

const MetricCard = ({ label, value, change, changePercent, prefix = '', suffix = '' }) => {
    const getChangeClass = (val) => {
        if (!val) return 'change-neutral';
        return val > 0 ? 'change-positive' : val < 0 ? 'change-negative' : 'change-neutral';
    };

    return (
        <div className="metric-card">
            <div className="metric-info">
                <span className="metric-label">{label}</span>
                <span className="metric-value">
                    {prefix}{value}{suffix}
                </span>
            </div>
            {(change !== undefined || changePercent !== undefined) && (
                <div className={`metric-change ${getChangeClass(change || changePercent)}`}>
                    {change > 0 ? '+' : ''}{changePercent ? `${changePercent}%` : change}
                </div>
            )}
        </div>
    );
};

export default MetricCard;
