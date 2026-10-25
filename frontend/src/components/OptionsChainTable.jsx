import React, { useMemo, useRef, useEffect } from 'react';
import './components.css';

const OptionsChainTable = ({ chain, loading, currentPrice, strikeDepth = 15 }) => {
    const atmRowRef = useRef(null);
    const containerRef = useRef(null);

    // Process chain data to group by strike
    const groupedChain = useMemo(() => {
        if (!chain || chain.length === 0) return [];

        const strikes = {};

        chain.forEach(opt => {
            if (!strikes[opt.strike]) {
                strikes[opt.strike] = { strike: opt.strike, call: null, put: null };
            }
            if (opt.option_type === 'call') {
                strikes[opt.strike].call = opt;
            } else {
                strikes[opt.strike].put = opt;
            }
        });

        // Convert to array and sort by strike
        let sorted = Object.values(strikes).sort((a, b) => a.strike - b.strike);

        // Filter by depth if not 'all'
        if (strikeDepth !== 'all' && currentPrice) {
            let closestIdx = 0;
            let minDiff = Infinity;
            sorted.forEach((row, idx) => {
                const diff = Math.abs(row.strike - currentPrice);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = idx;
                }
            });

            const startIdx = Math.max(0, closestIdx - strikeDepth);
            const endIdx = Math.min(sorted.length, closestIdx + strikeDepth + 1);
            sorted = sorted.slice(startIdx, endIdx);
        }

        return sorted;
    }, [chain, strikeDepth, currentPrice]);

    // Find ATM index for scrolling
    const atmIndex = useMemo(() => {
        if (!currentPrice || groupedChain.length === 0) return -1;
        let closestIdx = 0;
        let minDiff = Infinity;
        groupedChain.forEach((row, idx) => {
            const diff = Math.abs(row.strike - currentPrice);
            if (diff < minDiff) {
                minDiff = diff;
                closestIdx = idx;
            }
        });
        return closestIdx;
    }, [groupedChain, currentPrice]);

    // Auto-scroll to ATM row when data loads
    useEffect(() => {
        if (atmRowRef.current && containerRef.current) {
            const container = containerRef.current;
            const row = atmRowRef.current;
            const containerHeight = container.clientHeight;
            const rowTop = row.offsetTop;
            const rowHeight = row.clientHeight;

            const scrollTo = rowTop - (containerHeight / 2) + (rowHeight / 2);
            container.scrollTop = Math.max(0, scrollTo);
        }
    }, [groupedChain, atmIndex]);

    const formatNum = (val, decimals = 2) => {
        if (val === undefined || val === null) return '-';
        return Number(val).toFixed(decimals);
    };

    const formatPct = (val) => {
        if (val === undefined || val === null) return '-';
        return (Number(val) * 100).toFixed(1) + '%';
    };

    const formatGreek = (val) => {
        if (val === undefined || val === null) return '-';
        return Number(val).toFixed(3);
    };

    if (loading) {
        return (
            <div className="spinner-container" style={{ height: '300px' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    if (!chain || chain.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                No options data available for this expiration.
            </div>
        );
    }

    return (
        <div className="options-chain-container" ref={containerRef}>
            <table className="options-chain-table">
                <thead>
                    <tr>
                        <th colSpan="6" className="calls-header">CALLS</th>
                        <th className="col-strike">STRIKE</th>
                        <th colSpan="6" className="puts-header">PUTS</th>
                    </tr>
                    <tr>
                        <th className="col-delta">Delta</th>
                        <th className="col-theta">Theta</th>
                        <th className="col-bid">Bid</th>
                        <th className="col-ask">Ask</th>
                        <th className="col-last">Last</th>
                        <th className="col-iv">IV</th>
                        <th className="col-strike"></th>
                        <th className="col-iv">IV</th>
                        <th className="col-last">Last</th>
                        <th className="col-bid">Bid</th>
                        <th className="col-ask">Ask</th>
                        <th className="col-theta">Theta</th>
                        <th className="col-delta">Delta</th>
                    </tr>
                </thead>
                <tbody>
                    {groupedChain.map((row, idx) => {
                        const isCallITM = currentPrice && row.strike < currentPrice;
                        const isPutITM = currentPrice && row.strike > currentPrice;
                        const isATM = idx === atmIndex;

                        return (
                            <tr
                                key={row.strike}
                                className={isATM ? 'atm-row' : ''}
                                ref={isATM ? atmRowRef : null}
                            >
                                {/* CALLS SIDE */}
                                <td className={`col-delta ${isCallITM ? 'itm-call' : ''}`}>
                                    {row.call ? formatGreek(row.call.delta) : '-'}
                                </td>
                                <td className={`col-theta ${isCallITM ? 'itm-call' : ''}`}>
                                    {row.call ? formatGreek(row.call.theta) : '-'}
                                </td>
                                <td className={`col-bid ${isCallITM ? 'itm-call' : ''}`}>
                                    {row.call ? formatNum(row.call.bid) : '-'}
                                </td>
                                <td className={`col-ask ${isCallITM ? 'itm-call' : ''}`}>
                                    {row.call ? formatNum(row.call.ask) : '-'}
                                </td>
                                <td className={`col-last ${isCallITM ? 'itm-call' : ''}`}>
                                    {row.call ? formatNum(row.call.last_price) : '-'}
                                </td>
                                <td className={`col-iv ${isCallITM ? 'itm-call' : ''}`}>
                                    {row.call ? formatPct(row.call.implied_volatility) : '-'}
                                </td>

                                {/* STRIKE */}
                                <td className="col-strike">
                                    {row.strike}
                                </td>

                                {/* PUTS SIDE */}
                                <td className={`col-iv ${isPutITM ? 'itm-put' : ''}`}>
                                    {row.put ? formatPct(row.put.implied_volatility) : '-'}
                                </td>
                                <td className={`col-last ${isPutITM ? 'itm-put' : ''}`}>
                                    {row.put ? formatNum(row.put.last_price) : '-'}
                                </td>
                                <td className={`col-bid ${isPutITM ? 'itm-put' : ''}`}>
                                    {row.put ? formatNum(row.put.bid) : '-'}
                                </td>
                                <td className={`col-ask ${isPutITM ? 'itm-put' : ''}`}>
                                    {row.put ? formatNum(row.put.ask) : '-'}
                                </td>
                                <td className={`col-theta ${isPutITM ? 'itm-put' : ''}`}>
                                    {row.put ? formatGreek(row.put.theta) : '-'}
                                </td>
                                <td className={`col-delta ${isPutITM ? 'itm-put' : ''}`}>
                                    {row.put ? formatGreek(row.put.delta) : '-'}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default OptionsChainTable;
