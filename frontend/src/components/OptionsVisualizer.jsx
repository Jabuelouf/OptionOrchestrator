import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import { Card } from './';

const OptionsVisualizer = ({ chain, currentPrice: _currentPrice }) => {

    // Prepare data for charts
    const chartData = useMemo(() => {
        if (!chain) return [];

        // Merge calls and puts by strike
        const data = [];
        const strikes = new Set([
            ...chain.calls.map(c => c.strike),
            ...chain.puts.map(p => p.strike)
        ]);

        Array.from(strikes).sort((a, b) => a - b).forEach(strike => {
            const call = chain.calls.find(c => c.strike === strike);
            const put = chain.puts.find(p => p.strike === strike);

            data.push({
                strike,
                callVolume: call ? call.volume : 0,
                putVolume: put ? put.volume : 0,
                callOI: call ? call.open_interest : 0,
                putOI: put ? put.open_interest : 0,
                callIV: call ? call.implied_volatility * 100 : null,
                putIV: put ? put.implied_volatility * 100 : null,
                callDelta: call ? call.delta : null,
                putDelta: put ? put.delta : null,
                callGamma: call ? call.gamma : null,
                putGamma: put ? put.gamma : null,
                callTheta: call ? call.theta : null,
                putTheta: put ? put.theta : null,
            });
        });

        return data;
    }, [chain]);

    if (!chain || chartData.length === 0) return <div className="p-4 text-center">No data for visualization</div>;

    return (
        <div className="options-visualizer">
            <div className="grid-layout">
                {/* Volume Distribution */}
                <Card title="Volume Distribution">
                    <div style={{ height: 300, width: '100%' }}>
                        <ResponsiveContainer>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis dataKey="strike" />
                                <YAxis />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                                />
                                <Legend />
                                <Bar dataKey="callVolume" name="Call Vol" fill="var(--color-success)" opacity={0.7} />
                                <Bar dataKey="putVolume" name="Put Vol" fill="var(--color-danger)" opacity={0.7} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* Open Interest Distribution */}
                <Card title="Open Interest Config">
                    <div style={{ height: 300, width: '100%' }}>
                        <ResponsiveContainer>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis dataKey="strike" />
                                <YAxis />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                                />
                                <Legend />
                                <Bar dataKey="callOI" name="Call OI" fill="var(--color-success)" />
                                <Bar dataKey="putOI" name="Put OI" fill="var(--color-danger)" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* IV Smile */}
                <Card title="IV Smile (Volatility Skew)">
                    <div style={{ height: 300, width: '100%' }}>
                        <ResponsiveContainer>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis
                                    dataKey="strike"
                                    type="number"
                                    domain={['auto', 'auto']}
                                />
                                <YAxis label={{ value: 'IV %', angle: -90, position: 'insideLeft' }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                                />
                                <Legend />
                                <Line type="monotone" dataKey="callIV" name="Call IV" stroke="var(--color-success)" dot={false} strokeWidth={2} />
                                <Line type="monotone" dataKey="putIV" name="Put IV" stroke="var(--color-danger)" dot={false} strokeWidth={2} />
                                {/* Current Price Reference Line would be nice */}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* Delta */}
                <Card title="Delta (Price Sensitivity)">
                    <div style={{ height: 300, width: '100%' }}>
                        <ResponsiveContainer>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis dataKey="strike" />
                                <YAxis />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }} />
                                <Legend />
                                <Line type="monotone" dataKey="callDelta" name="Call Δ" stroke="var(--color-success)" dot={false} strokeWidth={2} />
                                <Line type="monotone" dataKey="putDelta" name="Put Δ" stroke="var(--color-danger)" dot={false} strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* Gamma */}
                <Card title="Gamma (Δ Acceleration)">
                    <div style={{ height: 300, width: '100%' }}>
                        <ResponsiveContainer>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis dataKey="strike" />
                                <YAxis />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }} />
                                <Legend />
                                <Line type="monotone" dataKey="callGamma" name="Call Γ" stroke="var(--color-success)" dot={false} strokeWidth={2} />
                                <Line type="monotone" dataKey="putGamma" name="Put Γ" stroke="var(--color-danger)" dot={false} strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* Theta */}
                <Card title="Theta (Time Decay)">
                    <div style={{ height: 300, width: '100%' }}>
                        <ResponsiveContainer>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis dataKey="strike" />
                                <YAxis />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }} />
                                <Legend />
                                <Line type="monotone" dataKey="callTheta" name="Call Θ" stroke="var(--color-success)" dot={false} strokeWidth={2} />
                                <Line type="monotone" dataKey="putTheta" name="Put Θ" stroke="var(--color-danger)" dot={false} strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            <style>{`
                .col-span-2 { grid-column: span 2; }
                @media (max-width: 768px) {
                    .col-span-2 { grid-column: span 1; }
                }
            `}</style>
        </div>
    );
};

export default OptionsVisualizer;
