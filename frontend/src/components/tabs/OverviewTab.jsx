import React from 'react';
import { Card, MetricCard, StrategyCard, StockChart, NewsFeed } from '../index';

/**
 * Overview tab content for StockAnalysis page.
 * Shows price chart, key statistics, AI outlook, and news.
 */
const OverviewTab = ({
    history,
    historyLoading,
    historyPeriod,
    onPeriodChange,
    quote,
    technical,
    volatility,
    strategies,
    news,
    newsLoading
}) => {
    return (
        <div className="overview-grid">
            <div className="main-chart-area">
                <StockChart
                    data={history}
                    loading={historyLoading}
                    period={historyPeriod}
                    onPeriodChange={onPeriodChange}
                />
            </div>

            <div className="side-metrics">
                <Card>
                    {/* Key Statistics Section */}
                    <div className="sidebar-section">
                        <h4 className="sidebar-section-title">Key Statistics</h4>
                        <div className="metrics-list">
                            <MetricCard label="Market Cap" value={quote.market_cap ? `$${(quote.market_cap / 1e9).toFixed(2)}B` : 'N/A'} />
                            <MetricCard label="P/E Ratio" value={quote.pe_ratio?.toFixed(2) || 'N/A'} />
                            <MetricCard label="52W High" value={quote.fifty_two_week_high?.toFixed(2) || 'N/A'} />
                            <MetricCard label="52W Low" value={quote.fifty_two_week_low?.toFixed(2) || 'N/A'} />
                        </div>
                    </div>

                    {/* AI Strategy Outlook Section */}
                    <div className="sidebar-section">
                        <h4 className="sidebar-section-title">AI Strategy Outlook</h4>
                        <div className="outlook-summary">
                            <div className={`outlook-badge ${technical?.direction === 'bullish' ? 'bullish' : 'bearish'}`}>
                                {(technical?.direction || 'NORMAL').toUpperCase()}
                            </div>
                            <p style={{ marginBottom: '1rem', marginTop: '0.5rem' }}>
                                Volatility is <strong>{volatility?.volatility_level}</strong>.
                                Consider <strong>{['high', 'extreme'].includes(volatility?.volatility_level) ? 'selling premium' : 'buying strategies'}</strong>.
                            </p>

                            {strategies?.best_strategy && (
                                <div className="top-pick">
                                    <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>TOP PICK</h5>
                                    <StrategyCard strategy={strategies.best_strategy} currentPrice={quote.price} />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Latest News Section */}
                    <div className="sidebar-section">
                        <h4 className="sidebar-section-title">Latest News</h4>
                        <NewsFeed news={news} loading={newsLoading} />
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default OverviewTab;
