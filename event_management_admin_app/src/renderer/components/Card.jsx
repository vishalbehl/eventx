// src/renderer/components/Card.jsx
export default function Card({ children, className }) {
  // Uses the 'surface' color and 'card' shadow from your theme
  const cardClasses = `bg-surface p-6 rounded-lg shadow-card ${className || ''}`;
  return <div className={cardClasses}>{children}</div>;
}