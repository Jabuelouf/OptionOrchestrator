import React from 'react';
import './components.css';

// Helper to format time ago
const timeAgo = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
};

const NewsCard = ({ article }) => {
    if (!article) return null;

    return (
        <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="news-card"
        >
            {article.thumbnail && (
                <div className="news-thumbnail">
                    <img src={article.thumbnail} alt="" />
                </div>
            )}
            <div className="news-content">
                <h4 className="news-title">{article.title}</h4>
                <div className="news-meta">
                    <span className="news-source">{article.source}</span>
                    <span className="news-time">{timeAgo(article.published)}</span>
                </div>
            </div>
        </a>
    );
};

export const NewsFeed = ({ news, loading }) => {
    if (loading) {
        return <div className="news-loading">Loading news...</div>;
    }

    if (!news || news.length === 0) {
        return <div className="news-empty">No recent news</div>;
    }

    return (
        <div className="news-feed">
            {news.map((article, idx) => (
                <NewsCard key={idx} article={article} />
            ))}
        </div>
    );
};

export default NewsCard;
