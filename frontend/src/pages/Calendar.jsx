import { useState, useEffect } from 'react';
import api from '../services/api';
import { LoadingSpinner } from '../components';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// Fallback stub data used when the backend is unreachable.
const STUB_EVENTS = [
    { date: '2026-02-09', time: 'BMO', symbol: 'KO', event: 'Earnings', estimate: '0.51', actual: '-' },
    { date: '2026-02-10', time: 'AMC', symbol: 'ORCL', event: 'Earnings', estimate: '1.48', actual: '-' },
    { date: '2026-02-10', time: '10:00', symbol: '-', event: 'JOLTS Job Openings', estimate: '7.88M', actual: '-' },
    { date: '2026-02-11', time: 'BMO', symbol: 'SHOP', event: 'Earnings', estimate: '0.43', actual: '-' },
    { date: '2026-02-11', time: '08:30', symbol: '-', event: 'CPI m/m', estimate: '0.3%', actual: '-' },
    { date: '2026-02-12', time: 'BMO', symbol: 'CSCO', event: 'Earnings', estimate: '0.91', actual: '-' },
    { date: '2026-02-12', time: '08:30', symbol: '-', event: 'PPI m/m', estimate: '0.2%', actual: '-' },
    { date: '2026-02-13', time: 'AMC', symbol: 'AMAT', event: 'Earnings', estimate: '2.29', actual: '-' },
    { date: '2026-02-14', time: 'BMO', symbol: 'DE', event: 'Earnings', estimate: '4.55', actual: '-' },
    { date: '2026-02-14', time: '08:30', symbol: '-', event: 'Retail Sales m/m', estimate: '0.0%', actual: '-' },
];

function getWeekDates(offset = 0) {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1 + offset * 7);
    return Array.from({ length: 5 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d.toISOString().slice(0, 10);
    });
}

function Calendar() {
    const [weekOffset, setWeekOffset] = useState(0);
    const [events, setEvents] = useState(STUB_EVENTS);
    const [loading, setLoading] = useState(true);
    const [liveData, setLiveData] = useState(false);

    const weekDates = getWeekDates(weekOffset);
    const today = new Date().toISOString().slice(0, 10);

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true);
            try {
                const res = await api.calendar.getEvents({ week_offset: weekOffset });
                if (!alive) return;
                const data = res?.data || {};
                const fetched = Array.isArray(data.events) ? data.events : [];
                if (fetched.length > 0) {
                    setEvents(fetched);
                    setLiveData(true);
                } else {
                    setEvents(STUB_EVENTS);
                    setLiveData(false);
                }
            } catch {
                if (!alive) return;
                setEvents(STUB_EVENTS);
                setLiveData(false);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [weekOffset]);

    const eventsForDate = (date) => events.filter((e) => e.date === date);

    return (
        <div className="container" style={{ padding: '8px 0 20px' }}>
            {/* Week navigation */}
            <div className="row" style={{ marginBottom: 10 }}>
                <button className="btn" onClick={() => setWeekOffset((w) => w - 1)}>&laquo; Prev</button>
                <button className="btn" onClick={() => setWeekOffset(0)} style={{ marginLeft: 4 }}>This Week</button>
                <button className="btn" onClick={() => setWeekOffset((w) => w + 1)} style={{ marginLeft: 4 }}>Next &raquo;</button>
                <div className="spacer" />
                <span className="muted" style={{ fontSize: 10 }}>
                    {weekDates[0]} to {weekDates[4]}
                    {liveData && <span style={{ marginLeft: 6, color: 'var(--pos)' }}>LIVE</span>}
                </span>
            </div>

            {loading ? (
                <div style={{ padding: '20px 0' }}><LoadingSpinner size="sm" /></div>
            ) : (
                <>
                    {/* Week strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, marginBottom: 12 }}>
                        {weekDates.map((date, i) => {
                            const isToday = date === today;
                            const dayEvents = eventsForDate(date);
                            return (
                                <div
                                    key={date}
                                    style={{
                                        border: isToday ? '2px solid var(--link)' : '1px solid var(--border)',
                                        background: isToday ? 'var(--pos-bg)' : 'var(--bg)',
                                        padding: 6,
                                        minHeight: 60,
                                    }}
                                >
                                    <div style={{ fontWeight: 700, fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 3 }}>
                                        {DAYS_OF_WEEK[i]} {date.slice(5)}
                                    </div>
                                    {dayEvents.length === 0 ? (
                                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>-</div>
                                    ) : (
                                        dayEvents.map((ev, j) => (
                                            <div key={j} style={{ fontSize: 10, lineHeight: 1.3, marginBottom: 2 }}>
                                                {ev.symbol !== '-' && (
                                                    <span className="mono" style={{ fontWeight: 700, marginRight: 3 }}>{ev.symbol}</span>
                                                )}
                                                <span style={{ color: 'var(--fg-secondary)' }}>{ev.event}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Full events table */}
                    <div className="section-header">Events Detail</div>
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Symbol</th>
                                <th>Event</th>
                                <th className="right">Estimate</th>
                                <th className="right">Actual</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.map((ev, idx) => (
                                <tr key={idx} style={ev.date === today ? { background: 'var(--pos-bg)' } : undefined}>
                                    <td className="mono">{ev.date}</td>
                                    <td className="mono muted">{ev.time}</td>
                                    <td className="mono" style={{ fontWeight: ev.symbol !== '-' ? 700 : 400 }}>{ev.symbol}</td>
                                    <td>{ev.event}</td>
                                    <td className="mono right">{ev.estimate}</td>
                                    <td className="mono right">{ev.actual}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {!liveData && (
                        <div style={{ marginTop: 12, padding: 8, border: '1px solid var(--border)', background: 'var(--bg-alt)', fontSize: 10, color: 'var(--muted)' }}>
                            Calendar data is currently using fallback stubs. The <code>/api/v1/calendar</code> endpoint
                            may not be reachable.
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default Calendar;
