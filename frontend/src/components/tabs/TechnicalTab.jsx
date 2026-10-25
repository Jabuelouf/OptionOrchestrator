import React from 'react';
import { Card, MetricCard } from '../index';

/**
 * Technical tab content for StockAnalysis page.
 * Shows technical indicators: trend, moving averages, RSI, MACD, Bollinger Bands.
 */
const TechnicalTab = ({ technical }) => {
    if (!technical) return null;

    return (
        <div className="technical-grid">
            <Card title="Trend Analysis">
                <div className="metrics-grid">
                    <MetricCard label="Trend" value={technical.direction?.toUpperCase() || 'N/A'} />
                    <MetricCard label="Strength" value={`${(technical.strength * 100).toFixed(0)}%`} />
                    <MetricCard label="Price vs SMA 200" value={technical.price_vs_sma_200?.toUpperCase() || 'N/A'} />
                </div>
            </Card>
            <Card title="Moving Averages">
                <div className="metrics-grid">
                    <MetricCard label="SMA 20" value={technical.sma_20?.toFixed(2) || 'N/A'} />
                    <MetricCard label="SMA 50" value={technical.sma_50?.toFixed(2) || 'N/A'} />
                    <MetricCard label="SMA 200" value={technical.sma_200?.toFixed(2) || 'N/A'} />
                </div>
            </Card>
            <Card title="RSI (14)">
                <div className="metrics-grid">
                    <MetricCard label="Value" value={technical.rsi?.value?.toFixed(2) || 'N/A'} />
                    <MetricCard label="Condition" value={technical.rsi?.condition?.toUpperCase() || 'N/A'} />
                </div>
            </Card>
            <Card title="MACD">
                <div className="metrics-grid">
                    <MetricCard label="MACD Line" value={technical.macd?.macd_line?.toFixed(2) || 'N/A'} />
                    <MetricCard label="Signal Line" value={technical.macd?.signal_line?.toFixed(2) || 'N/A'} />
                    <MetricCard label="Histogram" value={technical.macd?.histogram?.toFixed(2) || 'N/A'} />
                    <MetricCard label="Trend" value={technical.macd?.trend?.toUpperCase() || 'N/A'} />
                </div>
            </Card>
            <Card title="Bollinger Bands">
                <div className="metrics-grid">
                    <MetricCard label="Upper" value={technical.bollinger?.upper_band?.toFixed(2) || 'N/A'} />
                    <MetricCard label="Middle" value={technical.bollinger?.middle_band?.toFixed(2) || 'N/A'} />
                    <MetricCard label="Lower" value={technical.bollinger?.lower_band?.toFixed(2) || 'N/A'} />
                    <MetricCard label="%B" value={`${(technical.bollinger?.percent_b * 100).toFixed(1)}%`} />
                </div>
            </Card>
            {technical.stochastic && (
                <Card title="Stochastic Oscillator (14,3,3)">
                    <div className="metrics-grid">
                        <MetricCard label="%K" value={technical.stochastic?.percent_k?.toFixed(2) || 'N/A'} />
                        <MetricCard label="%D" value={technical.stochastic?.percent_d?.toFixed(2) || 'N/A'} />
                        <MetricCard label="Condition" value={technical.stochastic?.condition?.toUpperCase() || 'N/A'} />
                        <MetricCard
                            label="Signal"
                            value={technical.stochastic?.signal?.toUpperCase() || 'HOLD'}
                        />
                    </div>
                    <div className="stochastic-info">
                        {technical.stochastic?.condition === 'overbought' && (
                            <p className="indicator-note overbought">⚠️ Overbought (&gt;80): Potential reversal or pullback</p>
                        )}
                        {technical.stochastic?.condition === 'oversold' && (
                            <p className="indicator-note oversold">⚠️ Oversold (&lt;20): Potential bounce or reversal</p>
                        )}
                        {technical.stochastic?.signal === 'buy' && (
                            <p className="indicator-note bullish">📈 Bullish crossover: %K crossed above %D</p>
                        )}
                        {technical.stochastic?.signal === 'sell' && (
                            <p className="indicator-note bearish">📉 Bearish crossover: %K crossed below %D</p>
                        )}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default TechnicalTab;
