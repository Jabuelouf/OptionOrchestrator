import React, { useState } from 'react';
import OptionsChainTable from '../OptionsChainTable';
import OptionsVisualizer from '../OptionsVisualizer';

/**
 * Options Chain tab content for StockAnalysis page.
 * Shows options chain with expiration and depth controls.
 */
const OptionsChainTab = ({
    optionsExpirations,
    selectedExpiry,
    onExpiryChange,
    optionsChain,
    chainLoading,
    currentPrice,
    strikeDepth,
    onDepthChange
}) => {
    const [viewMode, setViewMode] = useState('table'); // 'table' or 'chart'

    return (
        <div className="options-chain-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h2 style={{ margin: 0 }}>Options Chain</h2>
                    <div className="view-toggle" style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '2px' }}>
                        <button
                            onClick={() => setViewMode('table')}
                            style={{
                                padding: '4px 12px',
                                border: 'none',
                                background: viewMode === 'table' ? 'var(--accent-color)' : 'transparent',
                                color: viewMode === 'table' ? 'white' : 'var(--text-secondary)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >
                            Table
                        </button>
                        <button
                            onClick={() => setViewMode('chart')}
                            style={{
                                padding: '4px 12px',
                                border: 'none',
                                background: viewMode === 'chart' ? 'var(--accent-color)' : 'transparent',
                                color: viewMode === 'chart' ? 'white' : 'var(--text-secondary)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >
                            Charts
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label htmlFor="depth-select" style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Depth:</label>
                        <select
                            id="depth-select"
                            value={strikeDepth}
                            onChange={(e) => onDepthChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                            style={{
                                background: 'var(--color-bg-tertiary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '0.25rem 0.5rem',
                                fontSize: '0.875rem',
                                color: 'var(--color-text-primary)'
                            }}
                        >
                            <option value={5}>±5</option>
                            <option value={10}>±10</option>
                            <option value={15}>±15</option>
                            <option value={20}>±20</option>
                            <option value={25}>±25</option>
                            <option value={30}>±30</option>
                            <option value="all">All</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label htmlFor="expiry-select" style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Expiration:</label>
                        <select
                            id="expiry-select"
                            value={selectedExpiry}
                            onChange={(e) => onExpiryChange(e.target.value)}
                            style={{
                                background: 'var(--color-bg-tertiary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '0.25rem 0.5rem',
                                fontSize: '0.875rem',
                                color: 'var(--color-text-primary)'
                            }}
                        >
                            {optionsExpirations.map(exp => (
                                <option key={exp} value={exp}>{exp}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {viewMode === 'table' ? (
                <OptionsChainTable
                    chain={optionsChain}
                    loading={chainLoading}
                    currentPrice={currentPrice}
                    strikeDepth={strikeDepth}
                />
            ) : (
                <OptionsVisualizer
                    chain={optionsChain}
                    currentPrice={currentPrice}
                />
            )}
        </div>
    );
};

export default OptionsChainTab;
