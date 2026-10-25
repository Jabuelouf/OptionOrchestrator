import React, { useMemo } from 'react';
import {
    ComposedChart,
    Area,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import Card from './Card';
import './components.css';

const StockChart = ({ data, loading, period = "1mo", onPeriodChange }) => {
    // Calculate SMAs and Bollinger Bands
    const chartData = useMemo(() => {
        if (!data || data.length === 0) return [];

        // Helper for simple moving average
        const calculateSMA = (period) => {
            const smas = [];
            for (let i = 0; i < data.length; i++) {
                if (i < period - 1) {
                    smas.push(null);
                    continue;
                }
                const slice = data.slice(i - period + 1, i + 1).map(d => d.close);
                const sum = slice.reduce((acc, curr) => acc + curr, 0);
                smas.push(sum / period);
            }
            return smas;
        };

        // Helper for Bollinger Bands (20, 2)
        const calculateBollinger = () => {
            const uppers = [];
            const lowers = [];
            const sma20 = [];

            for (let i = 0; i < data.length; i++) {
                if (i < 19) {
                    uppers.push(null);
                    lowers.push(null);
                    sma20.push(null);
                    continue;
                }

                const slice = data.slice(i - 19, i + 1).map(d => d.close);
                const mean = slice.reduce((a, b) => a + b, 0) / 20;

                const squareDiffs = slice.map(val => Math.pow(val - mean, 2));
                const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / 20;
                const stdDev = Math.sqrt(avgSquareDiff);

                sma20.push(mean);
                uppers.push(mean + (2 * stdDev));
                lowers.push(mean - (2 * stdDev));
            }
            return { sma20, uppers, lowers };
        };

        const sma50 = calculateSMA(50);
        const sma200 = calculateSMA(200);
        const bb = calculateBollinger();

        return data.map((point, i) => ({
            ...point,
            sma50: sma50[i],
            sma200: sma200[i],
            bbUpper: bb.uppers[i],
            bbLower: bb.lowers[i],
            bbMiddle: bb.sma20[i]
        }));
    }, [data]);

    if (loading) {
        return (
            <Card title="Price History" className="chart-card">
                <div className="placeholder-chart">
                    <div className="spinner-container">
                        <div className="spinner"></div>
                    </div>
                    <p>Loading Chart Data...</p>
                </div>
            </Card>
        );
    }

    if (!data || data.length === 0) {
        return (
            <Card title="Price History" className="chart-card">
                <div className="placeholder-chart">
                    <p>No chart data available.</p>
                </div>
            </Card>
        );
    }

    // Calculate domain
    const prices = data.map(d => d.close);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const buffer = (maxPrice - minPrice) * 0.1;
    const yDomain = [minPrice - buffer, maxPrice + buffer];

    const formatXAxis = (tickItem) => {
        if (!tickItem) return '';
        const date = new Date(tickItem);
        if (period === '1d' || period === '5d') {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    return (
        <Card title="Price History" className="chart-card">
            <div className="chart-controls mb-4 flex gap-2">
                {['1d', '5d', '1mo', '3mo', '6mo', '1y'].map((p) => (
                    <button
                        key={p}
                        onClick={() => onPeriodChange && onPeriodChange(p)}
                        className={`px-3 py-1 text-xs rounded transition-colors ${period === p ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    >
                        {p.toUpperCase()}
                    </button>
                ))}
            </div>
            <div style={{ width: '100%', height: 350 }}>
                <ResponsiveContainer>
                    <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                        <XAxis
                            dataKey="date"
                            tickFormatter={formatXAxis}
                            stroke="#9ca3af"
                            tick={{ fontSize: 12 }}
                            minTickGap={30}
                        />
                        <YAxis
                            domain={yDomain}
                            stroke="#9ca3af"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(val) => val ? `$${val.toFixed(2)}` : ''}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                            itemStyle={{ color: '#93c5fd' }}
                            labelStyle={{ color: '#d1d5db' }}
                            formatter={(value, name) => {
                                if (name === 'close') return [`$${value.toFixed(2)}`, 'Price'];
                                if (name === 'sma50') return [`$${value.toFixed(2)}`, 'SMA 50'];
                                if (name === 'sma200') return [`$${value.toFixed(2)}`, 'SMA 200'];
                                if (name === 'bbUpper') return [`$${value.toFixed(2)}`, 'Upper BB'];
                                if (name === 'bbLower') return [`$${value.toFixed(2)}`, 'Lower BB'];
                                if (name === 'bbMiddle') return [`$${value.toFixed(2)}`, 'Middle BB'];
                                return [value, name];
                            }}
                            labelFormatter={(label) => new Date(label).toLocaleString()}
                        />
                        <Legend wrapperStyle={{ paddingTop: '10px' }} />
                        <Area
                            type="monotone"
                            dataKey="close"
                            name="Price"
                            stroke="#3b82f6"
                            fillOpacity={1}
                            fill="url(#colorPrice)"
                            strokeWidth={2}
                        />
                        <Line
                            type="monotone"
                            dataKey="sma50"
                            name="SMA 50"
                            stroke="#fbbf24"
                            dot={false}
                            strokeWidth={2}
                            connectNulls
                        />
                        <Line
                            type="monotone"
                            dataKey="sma200"
                            name="SMA 200"
                            stroke="#f87171"
                            dot={false}
                            strokeWidth={2}
                            connectNulls
                        />
                        {/* Bollinger Bands - Subtle */}
                        <Line
                            type="monotone"
                            dataKey="bbUpper"
                            name="Upper BB"
                            stroke="#10b981"
                            strokeOpacity={0.5}
                            dot={false}
                            strokeWidth={1}
                            connectNulls
                        />
                        <Line
                            type="monotone"
                            dataKey="bbLower"
                            name="Lower BB"
                            stroke="#10b981"
                            strokeOpacity={0.5}
                            dot={false}
                            strokeWidth={1}
                            connectNulls
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
};

export default StockChart;
