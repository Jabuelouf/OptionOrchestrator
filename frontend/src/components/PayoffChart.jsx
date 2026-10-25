import React, { useMemo } from 'react';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine
} from 'recharts';
import './components.css';

const PayoffChart = ({ legs, currentPrice, symbol: _symbol, expiration }) => {
    const chartData = useMemo(() => {
        if (!legs || legs.length === 0 || !currentPrice) return [];

        // Determine range: +/- 20% by default, or wider if strikes are far
        let minStrike = currentPrice;
        let maxStrike = currentPrice;

        legs.forEach(leg => {
            if (leg.strike) {
                minStrike = Math.min(minStrike, leg.strike);
                maxStrike = Math.max(maxStrike, leg.strike);
            }
        });

        // Add 15% buffer beyond widest strikes
        const lowerBound = Math.min(currentPrice * 0.8, minStrike * 0.85);
        const upperBound = Math.max(currentPrice * 1.2, maxStrike * 1.15);
        const steps = 50;
        const stepSize = (upperBound - lowerBound) / steps;

        const data = [];

        for (let i = 0; i <= steps; i++) {
            const price = lowerBound + (i * stepSize);
            let totalPL = 0;

            legs.forEach(leg => {
                let legPL = 0;
                const qty = leg.quantity || 1;
                const premium = leg.premium || 0; // Price paid or received per unit

                if (leg.option_type === 'stock') {
                    // Stock leg
                    // If buy: P/L = (Current - Entry) * Qty
                    // Entry is roughly the premium passed (current price at analysis)
                    const profitPerShare = price - premium;
                    legPL = profitPerShare * qty;
                    if (leg.action === 'sell') legPL = -legPL;
                } else if (leg.option_type === 'call' || leg.option_type === 'put') {
                    // Option leg
                    const isCall = leg.option_type === 'call';
                    const strike = leg.strike;

                    // Value at expiration
                    let intrinsicValue = 0;
                    if (isCall) {
                        intrinsicValue = Math.max(0, price - strike);
                    } else { // Put
                        intrinsicValue = Math.max(0, strike - price);
                    }

                    // P/L Calculation
                    // Long: (Value - Cost) * 100
                    // Short: (Credit - Value) * 100
                    if (leg.action === 'buy') {
                        legPL = (intrinsicValue - premium) * 100 * qty;
                    } else { // sell
                        legPL = (premium - intrinsicValue) * 100 * qty;
                    }
                }

                totalPL += legPL;
            });

            data.push({
                price: price,
                profit: totalPL
            });
        }
        return data;
    }, [legs, currentPrice]);

    // Gradient definitions
    const gradientOffset = () => {
        const dataMax = Math.max(...chartData.map((i) => i.profit));
        const dataMin = Math.min(...chartData.map((i) => i.profit));

        if (dataMax <= 0) return 0;
        if (dataMin >= 0) return 1;

        return dataMax / (dataMax - dataMin);
    };

    const off = gradientOffset();

    if (!chartData.length) return null;

    // Get expiration from first option leg if not passed directly
    const expirationDate = expiration || legs?.find(l => l.expiration)?.expiration;
    const formattedExpiry = expirationDate
        ? new Date(expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Expiration';

    return (
        <div className="payoff-chart-container" style={{ height: '300px', width: '100%' }}>
            <h4 className="text-gray-400 text-sm mb-2 font-mono">Profit/Loss at Expiration ({formattedExpiry})</h4>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                    <defs>
                        <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={off} stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset={off} stopColor="#ef4444" stopOpacity={0.3} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis
                        dataKey="price"
                        type="number"
                        domain={['auto', 'auto']}
                        tickFormatter={(val) => `$${val.toFixed(0)}`}
                        stroke="#666"
                        tick={{ fontSize: 11 }}
                    />
                    <YAxis
                        tickFormatter={(val) => `$${val}`}
                        stroke="#666"
                        tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                        formatter={(val) => [`$${val.toFixed(2)}`, 'Profit/Loss']}
                        labelFormatter={(val) => `Stock Price at Expiry: $${val.toFixed(2)}`}
                    />
                    <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                    <ReferenceLine x={currentPrice} stroke="#3b82f6" label={{ value: 'Curr', fill: '#3b82f6', fontSize: 10 }} />
                    <Area
                        type="monotone"
                        dataKey="profit"
                        stroke="#888"
                        fill="url(#splitColor)"
                        strokeWidth={2}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default PayoffChart;
