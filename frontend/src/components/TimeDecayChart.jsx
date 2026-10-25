import React from 'react';
import {
    ResponsiveContainer,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    Area,
    AreaChart
} from 'recharts';
import './components.css';

const TimeDecayChart = ({ data, loading }) => {
    if (loading) {
        return (
            <div className="flex justify-center items-center h-[300px] bg-gray-900/40 rounded-lg border border-gray-800">
                <div className="spinner"></div>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="flex justify-center items-center h-[300px] bg-gray-900/40 rounded-lg border border-gray-800 text-gray-500">
                No simulation data available
            </div>
        );
    }

    // Format dates for axis
    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // Calculate gradient offset for P/L coloring
    const gradientOffset = () => {
        const dataMax = Math.max(...data.map((i) => i.projected_profit));
        const dataMin = Math.min(...data.map((i) => i.projected_profit));

        if (dataMax <= 0) return 0;
        if (dataMin >= 0) return 1;

        return dataMax / (dataMax - dataMin);
    };

    const off = gradientOffset();

    return (
        <div className="payoff-chart-container" style={{ height: '300px', width: '100%' }}>
            <h4 className="text-gray-400 text-sm mb-2 font-mono">Projected P/L Over Time (Theta Decay)</h4>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={data}
                    margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                >
                    <defs>
                        <linearGradient id="splitColorDecay" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={off} stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset={off} stopColor="#ef4444" stopOpacity={0.3} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        stroke="#666"
                        tick={{ fontSize: 11 }}
                        minTickGap={30}
                    />
                    <YAxis
                        tickFormatter={(val) => `$${val}`}
                        stroke="#666"
                        tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', fontSize: '12px' }}
                        formatter={(val) => [`$${val.toFixed(2)}`, 'Projected P/L']}
                        labelFormatter={(label) => formatDate(label)}
                    />
                    <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                    <Area
                        type="monotone"
                        dataKey="projected_profit"
                        stroke="#888"
                        fill="url(#splitColorDecay)"
                        strokeWidth={2}
                        dot={false}
                        animationDuration={1000}
                    />
                </AreaChart>
            </ResponsiveContainer>
            <div className="text-xs text-gray-500 mt-2 text-center italic">
                * Assumes constant stock price and IV. Only accounts for time decay.
            </div>
        </div>
    );
};

export default TimeDecayChart;
