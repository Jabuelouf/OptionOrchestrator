import React from 'react';
import { Card, MetricCard } from '../index';

/**
 * Volatility tab content for StockAnalysis page.
 * Shows IV rank, IV percentile, historical volatility, and expected move.
 */
const VolatilityTab = ({ volatility, currentPrice }) => {
    if (!volatility) return null;

    return (
        <div className="volatility-grid">
            <Card title="Volatility Profile">
                <div className="metrics-grid">
                    <MetricCard label="IV Rank" value={volatility.iv_rank ? volatility.iv_rank.toFixed(2) : 'N/A'} />
                    <MetricCard label="IV Percentile" value={volatility.iv_percentile ? volatility.iv_percentile.toFixed(2) : 'N/A'} />
                    <MetricCard label="HV (30d)" value={(volatility.historical_volatility_30d * 100).toFixed(2) + '%'} />
                </div>
            </Card>
            <Card title="Expected Move">
                <div className="metrics-grid">
                    <MetricCard label="Weekly Move" value={`±$${(currentPrice * 0.03).toFixed(2)}`} /* Approx placeholder */ />
                </div>
            </Card>
        </div>
    );
};

export default VolatilityTab;
