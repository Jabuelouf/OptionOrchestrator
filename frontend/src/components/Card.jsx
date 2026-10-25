/**
 * Card - Flat container with optional header.
 * Props:
 *   title    - optional header text
 *   badge    - optional badge text after title
 *   children - body content
 *   style    - optional additional styles
 */
export default function Card({ title, badge, children, style }) {
    return (
        <div className="card" style={style}>
            {title && (
                <div className="card-header">
                    <span>{title}</span>
                    {badge && <span className="badge">{badge}</span>}
                </div>
            )}
            <div className="card-body">{children}</div>
        </div>
    );
}
