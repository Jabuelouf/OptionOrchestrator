import React from 'react';
import './components.css';

/**
 * Display Greeks for a strategy position.
 * Shows Delta, Gamma, Theta, Vega with color-coded values.
 */
const GreeksDisplay = ({ greeks, compact = false }) => {
    if (!greeks) return null;

    // Format Greek value with sign and color
    const formatGreek = (value, decimals = 4) => {
        if (value === null || value === undefined) return 'N/A';
        const num = parseFloat(value);
        return num.toFixed(decimals);
    };

    // Determine color based on value (positive = green, negative = red)
    const getValueColor = (value, invertForTheta = false) => {
        if (value === null || value === undefined) return 'var(--color-text-primary)';
        const num = parseFloat(value);
        if (invertForTheta) {
            // For theta, negative is expected for long positions
            return num < 0 ? 'var(--color-warning)' : 'var(--color-success)';
        }
        return num >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
    };

    const greekItems = [
        {
            label: 'Delta',
            value: greeks.delta,
            symbol: 'Δ',
            tooltip: 'Position sensitivity to $1 move in underlying',
            decimals: 4
        },
        {
            label: 'Gamma',
            value: greeks.gamma,
            symbol: 'Γ',
            tooltip: 'Rate of change of delta per $1 move',
            decimals: 4
        },
        {
            label: 'Theta',
            value: greeks.theta,
            symbol: 'Θ',
            tooltip: 'Daily time decay ($ lost per day)',
            decimals: 2,
            invertColor: true
        },
        {
            label: 'Vega',
            value: greeks.vega,
            symbol: 'ν',
            tooltip: 'Sensitivity to 1% change in IV',
            decimals: 2
        }
    ];

    if (compact) {
        return (
            <div className="greeks-display-compact">
                {greekItems.map(item => (
                    <span
                        key={item.label}
                        className="greek-compact"
                        title={item.tooltip}
                    >
                        <span className="greek-symbol">{item.symbol}</span>
                        <span style={{ color: getValueColor(item.value, item.invertColor) }}>
                            {formatGreek(item.value, item.decimals)}
                        </span>
                    </span>
                ))}
            </div>
        );
    }

    return (
        <div className="greeks-display">
            <h4 className="greeks-title">Position Greeks</h4>
            <div className="greeks-grid">
                {greekItems.map(item => (
                    <div key={item.label} className="greek-item" title={item.tooltip}>
                        <div className="greek-label">
                            <span className="greek-symbol">{item.symbol}</span>
                            <span>{item.label}</span>
                        </div>
                        <div
                            className="greek-value"
                            style={{ color: getValueColor(item.value, item.invertColor) }}
                        >
                            {formatGreek(item.value, item.decimals)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default GreeksDisplay;
