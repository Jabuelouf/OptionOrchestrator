import { useState } from 'react';

const StockSearch = ({ onSearch, placeholder = 'Symbol (e.g. AAPL)' }) => {
    const [symbol, setSymbol] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        const v = symbol.trim().toUpperCase();
        if (!v) return;
        onSearch(v);
        setSymbol('');
    };

    return (
        <form onSubmit={handleSubmit} className="row" style={{ width: '100%' }}>
            <input
                className="stock-search-input"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder={placeholder}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
            />
            <button className="btn primary" type="submit" style={{ flexShrink: 0 }}>Go</button>
        </form>
    );
};

export default StockSearch;
