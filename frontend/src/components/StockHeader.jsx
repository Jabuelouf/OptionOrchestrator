import React from 'react';
import Card from './Card';
import './components.css';

const StockHeader = ({ quote, loading }) => {
    if (loading) {
        return (
            <Card>
                <div className="stock-header-skeleton animate-pulse">
                    <div className="h-8 w-32 bg-gray-700/50 rounded mb-4"></div>
                    <div className="flex gap-8">
                        <div className="h-6 w-24 bg-gray-700/50 rounded"></div>
                        <div className="h-6 w-24 bg-gray-700/50 rounded"></div>
                        <div className="h-6 w-24 bg-gray-700/50 rounded"></div>
                    </div>
                </div>
            </Card>
        );
    }

    if (!quote) return null;

    const isPositive = quote.change >= 0;
    const changeClass = isPositive ? 'change-positive' : 'change-negative';
    const changeSign = isPositive ? '+' : '';

    const formatLargeNumber = (num) => {
        if (!num) return '-';
        if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
        if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
        return num.toString();
    };

    return (
        <div className="stock-header-container mb-6">
            <div className="header-primary-row">
                <div>
                    <h1 className="stock-symbol-title">{quote.symbol}</h1>
                    {quote.company_name && (
                        <p className="company-name">{quote.company_name}</p>
                    )}
                    <div className="price-display">
                        <span className="stock-price-lg">
                            ${quote.price.toFixed(2)}
                        </span>
                        <span className={`stock-change-badge ${changeClass}`}>
                            {changeSign}{quote.change.toFixed(2)} ({changeSign}{quote.change_percent.toFixed(2)}%)
                        </span>
                    </div>
                </div>
                <div className="last-updated">
                    Last Updated: {new Date(quote.timestamp).toLocaleTimeString()}
                </div>
            </div>

            <div className="stock-metrics-grid">
                <div className="metric-card">
                    <div className="metric-info">
                        <span className="metric-label">Volume</span>
                        <span className="metric-value">{formatLargeNumber(quote.volume)}</span>
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-info">
                        <span className="metric-label">Avg Volume</span>
                        <span className="metric-value">{formatLargeNumber(quote.avg_volume)}</span>
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-info">
                        <span className="metric-label">Market Cap</span>
                        <span className="metric-value">${formatLargeNumber(quote.market_cap)}</span>
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-info">
                        <span className="metric-label">P/E Ratio</span>
                        <span className="metric-value">{quote.pe_ratio ? quote.pe_ratio.toFixed(2) : '-'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StockHeader;
