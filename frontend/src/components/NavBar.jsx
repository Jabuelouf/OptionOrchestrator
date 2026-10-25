import { Link, useLocation, useNavigate } from 'react-router-dom';
import StockSearch from './StockSearch';
import { useTheme } from './ThemeProvider';

const NAV_LINKS = [
    { to: '/', label: 'Home' },
    { to: '/screener', label: 'Screener' },
    { to: '/portfolio', label: 'Portfolio' },
    { to: '/calendar', label: 'Calendar' },
    { to: '/backtests', label: 'Backtests' },
];

export default function NavBar() {
    const navigate = useNavigate();
    const location = useLocation();
    const { theme, toggle } = useTheme();
    const go = (sym) => navigate(`/analysis/${sym}`);

    return (
        <div>
            {/* Top bar: logo + search + theme toggle */}
            <div style={{ background: 'var(--header-bg)', borderBottom: '1px solid rgba(0,0,0,0.3)' }}>
                <div className="container" style={{ padding: '6px var(--space-lg)' }}>
                    <div className="row" style={{ gap: 12 }}>
                        <Link to="/" style={{ textDecoration: 'none', color: 'var(--header-fg)' }}>
                            <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.5 }}>Option</span>
                            <span style={{ fontWeight: 400, fontSize: 16, color: 'rgba(255,255,255,0.5)', margin: '0 2px' }}>|</span>
                            <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.5 }}>Orchestrator</span>
                        </Link>

                        <div style={{ minWidth: 260, flex: 1, maxWidth: 400 }}>
                            <StockSearch onSearch={go} placeholder="Ticker lookup..." />
                        </div>

                        <div className="spacer" />

                        <button className="theme-toggle" onClick={toggle} title="Toggle dark/light mode">
                            {theme === 'light' ? '\u263E' : '\u2600'}
                        </button>

                        <span className="hide-mobile" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                            {new Date().toLocaleString()}
                        </span>
                    </div>
                </div>
            </div>

            {/* Nav links bar */}
            <div style={{ background: 'var(--nav-bg)', borderBottom: '1px solid var(--border)' }}>
                <div className="container" style={{ padding: '0 var(--space-lg)' }}>
                    <div className="row" style={{ gap: 0 }}>
                        {NAV_LINKS.map((link, idx) => {
                            const isActive =
                                link.to === '/'
                                    ? location.pathname === '/'
                                    : location.pathname.startsWith(link.to);
                            return (
                                <span key={link.to} style={{ display: 'flex', alignItems: 'center' }}>
                                    {idx > 0 && (
                                        <span style={{ color: 'var(--muted)', fontSize: 10, padding: '0 2px' }}>|</span>
                                    )}
                                    <Link
                                        to={link.to}
                                        style={{
                                            textDecoration: 'none',
                                            padding: '5px 8px',
                                            fontSize: 11,
                                            fontWeight: isActive ? 700 : 400,
                                            color: isActive ? 'var(--nav-active)' : 'var(--fg-secondary)',
                                            borderBottom: isActive ? '2px solid var(--link)' : '2px solid transparent',
                                        }}
                                    >
                                        {link.label}
                                    </Link>
                                </span>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
