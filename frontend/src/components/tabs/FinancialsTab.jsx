import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import Card from '../Card';
import LoadingSpinner from '../LoadingSpinner';

const FinancialsTab = ({ symbol }) => {
    const [filings, setFilings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedFiling, setSelectedFiling] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [error, setError] = useState(null);

    const fetchFilings = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await api.fundamentals.getFilings(symbol);
            setFilings(response.data);
            setAnalysis(null);
            setSelectedFiling(null);
        } catch (err) {
            console.error("Error fetching filings:", err);
            setError("Failed to load filings.");
        } finally {
            setLoading(false);
        }
    }, [symbol]);

    useEffect(() => {
        if (symbol) {
            fetchFilings();
        }
    }, [symbol, fetchFilings]);

    const handleAnalyze = async (filing) => {
        try {
            setAnalyzing(true);
            setSelectedFiling(filing);
            // Clear previous analysis if switching
            if (analysis && analysis.filing_id !== filing.filing_id) {
                setAnalysis(null);
            }

            const response = await api.fundamentals.getAnalysis(symbol, filing.filing_id);
            setAnalysis(response.data);
        } catch (err) {
            console.error("Error analyzing filing:", err);
            setError(`Failed to analyze filing ${filing.filing_id}`);
        } finally {
            setAnalyzing(false);
        }
    };

    if (loading) return <LoadingSpinner />;
    if (error) return <div className="error-message">{error}</div>;

    return (
        <div className="financials-tab-container" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
            <div className="filings-list">
                <h3>SEC Filings</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {filings.map((f) => (
                        <Card
                            key={f.filing_id}
                            className={`filing-card ${selectedFiling?.filing_id === f.filing_id ? 'active' : ''}`}
                            style={{
                                cursor: 'pointer',
                                border: selectedFiling?.filing_id === f.filing_id ? '2px solid var(--primary)' : '1px solid var(--border)',
                                padding: '10px'
                            }}
                            onClick={() => handleAnalyze(f)}
                        >
                            <div className="filing-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span className="filing-type" style={{ fontWeight: 'bold' }}>{f.filing_type}</span>
                                <span className="filing-date" style={{ fontSize: '0.8em', color: '#888' }}>
                                    {new Date(f.filing_date).toLocaleDateString()}
                                </span>
                            </div>
                            <div style={{ marginTop: '5px', fontSize: '0.9em' }}>
                                Period: {f.report_period || 'N/A'}
                            </div>
                            {analyzing && selectedFiling?.filing_id === f.filing_id && (
                                <div style={{ marginTop: '5px', color: 'var(--accent)' }}>Analyzing...</div>
                            )}
                        </Card>
                    ))}
                    {filings.length === 0 && <p>No recent filings found.</p>}
                </div>
            </div>

            <div className="analysis-panel">
                {analysis ? (
                    <div className="analysis-content">
                        <h3 style={{ marginTop: 0 }}>Analysis: {selectedFiling?.filing_type} ({selectedFiling?.report_period})</h3>

                        <div className="sentiment-section" style={{ marginBottom: '20px' }}>
                            <Card>
                                <h4>Sentiment Verdict</h4>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div className={`verdict-badge ${analysis.sentiment.verdict.toLowerCase()}`}
                                        style={{
                                            fontSize: '1.2em',
                                            fontWeight: 'bold',
                                            color: analysis.sentiment.verdict === 'Bullish' ? '#4caf50' : analysis.sentiment.verdict === 'Bearish' ? '#f44336' : '#ff9800'
                                        }}
                                    >
                                        {analysis.sentiment.verdict}
                                    </div>
                                    <div>
                                        <div>Polarity: <strong>{analysis.sentiment.polarity.toFixed(2)}</strong></div>
                                        <div>Subjectivity: <strong>{analysis.sentiment.subjectivity.toFixed(2)}</strong></div>
                                    </div>
                                    <div>
                                        <span style={{ color: '#4caf50' }}>+{analysis.sentiment.positive_score}</span> /
                                        <span style={{ color: '#f44336' }}>-{analysis.sentiment.negative_score}</span>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        <div className="risks-opportunities" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <Card title="Key Risks">
                                <ul style={{ paddingLeft: '20px' }}>
                                    {analysis.key_risks.length > 0 ? (
                                        analysis.key_risks.map((item, i) => <li key={i}>{item}</li>)
                                    ) : (
                                        <li>No significant risks detected in summary.</li>
                                    )}
                                </ul>
                            </Card>

                            <Card title="Opportunities">
                                <ul style={{ paddingLeft: '20px' }}>
                                    {analysis.key_opportunities.length > 0 ? (
                                        analysis.key_opportunities.map((item, i) => <li key={i}>{item}</li>)
                                    ) : (
                                        <li>No specific opportunities detected in summary.</li>
                                    )}
                                </ul>
                            </Card>
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#666' }}>
                        {selectedFiling && analyzing ? <LoadingSpinner /> : <p>Select a filing to view AI analysis.</p>}
                    </div>
                )}
            </div>
        </div>
    );
};

export default FinancialsTab;
