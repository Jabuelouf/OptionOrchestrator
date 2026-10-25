import axios from 'axios';

// Create an axios instance with default config
const apiClient = axios.create({
    baseURL: '/api/v1', // Vite proxy will handle forwarding to http://localhost:8000
    headers: {
        'Content-Type': 'application/json',
    },
    // Market data calls (intraday history / options snapshots) can exceed 10s depending on provider rate limits.
    timeout: 30000,
});

// API Service object organizing all endpoints
const api = {
    // Market Data Endpoints
    market: {
        getOverview: () => apiClient.get('/market/overview'),
        getQuote: (symbol) => apiClient.get(`/market/${symbol}`),
        getAnalysis: (symbol, params) => apiClient.get(`/market/${symbol}/analysis`, { params }),
        getHome: (params = {}, config = {}) => apiClient.get('/market/home', { params, ...config }),
        getOptionsChain: (symbol, expiration) => {
            const params = expiration ? { expiration } : {};
            return apiClient.get(`/market/${symbol}/options`, { params });
        },
        getExpirations: (symbol) => apiClient.get(`/market/${symbol}/options/expirations`),
        getHistory: (symbol, period = '1mo', interval = '1d') =>
            apiClient.get(`/market/${symbol}/history`, { params: { period, interval } }),
        getTechnicalAnalysis: (symbol, period = '1y') =>
            apiClient.get(`/market/${symbol}/technical`, { params: { period } }),
        getVolatilityAnalysis: (symbol, period = '1y') =>
            apiClient.get(`/market/${symbol}/volatility`, { params: { period } }),
        getNews: (symbol, limit = 5) =>
            apiClient.get(`/market/${symbol}/news`, { params: { limit } }),
    },

    // Strategy Endpoints
    strategies: {
        getOverview: (symbol) => apiClient.get(`/strategies/${symbol}/overview`),
        getCoveredCalls: (symbol, params) =>
            apiClient.get(`/strategies/${symbol}/covered-calls`, { params }),
        getCashSecuredPuts: (symbol, params) =>
            apiClient.get(`/strategies/${symbol}/cash-secured-puts`, { params }),
        getLongOptions: (symbol, params) =>
            apiClient.get(`/strategies/${symbol}/long-options`, { params }),
        getProtectivePuts: (symbol, params) =>
            apiClient.get(`/strategies/${symbol}/protective-puts`, { params }),
        getVerticalSpreads: (symbol, params) =>
            apiClient.get(`/strategies/${symbol}/vertical-spreads`, { params }),
        getIronCondors: (symbol, params) =>
            apiClient.get(`/strategies/${symbol}/iron-condors`, { params }),
        getStraddlesStrangles: (symbol, params) =>
            apiClient.get(`/strategies/${symbol}/straddles-strangles`, { params }),
        getWheel: (symbol, params) =>
            apiClient.get(`/strategies/${symbol}/wheel`, { params }),
        getButterfly: (symbol, params) =>
            apiClient.get(`/strategies/${symbol}/butterfly`, { params }),
        getTimeSpreads: (symbol, params) =>
            apiClient.get(`/strategies/${symbol}/time-spreads`, { params }),
        getRatioSpreads: (symbol, params) =>
            apiClient.get(`/strategies/${symbol}/ratio-spreads`, { params }),
        getJadeLizards: (symbol, params) =>
            apiClient.get(`/strategies/${symbol}/jade-lizards`, { params }),
        calculateGreeks: (data) => apiClient.post('/strategies/calculate-greeks', data),
        compareStrategies: (data) => apiClient.post('/strategies/compare-strategies', data),
        simulatePerformance: (data) => apiClient.post('/strategies/simulate-performance', data),
    },

    tools: {
        getScreener: (params) => apiClient.get('/tools/screener', { params }),
    },
    portfolio: {
        getAll: () => apiClient.get('/portfolio/'),
        add: (position) => apiClient.post('/portfolio/', position),
        getCorrelation: (symbols) => apiClient.post('/portfolio/correlation', { symbols }),
        getVaR: (params) => apiClient.get('/portfolio/var', { params }),
    },
    fundamentals: {
        getFinancials: (symbol) => apiClient.get(`/fundamentals/${symbol}`),
        getFilings: (symbol) => apiClient.get(`/fundamentals/${symbol}/filings`),
        getAnalysis: (symbol, filingId) => apiClient.get(`/fundamentals/${symbol}/filings/${filingId}/analysis`),
    },
    alerts: {
        getAll: (params) => apiClient.get('/alerts/', { params }),
        create: (payload) => apiClient.post('/alerts/', payload),
        delete: (id) => apiClient.delete(`/alerts/${id}`),
        check: () => apiClient.post('/alerts/check'),
    },
    backtest: {
        run: (payload) => apiClient.post('/backtest/run', payload),
    },
    calendar: {
        getEvents: (params) => apiClient.get('/calendar/', { params }),
    },

    // Health Check
    health: () => apiClient.get('/'),
};

export default api;
