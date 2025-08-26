// src/renderer/components/Button.jsx
export default function Button({ children, onClick, className }) {
  // Uses the 'primary' color from your theme
  const buttonClasses = `bg-primary text-white font-semibold py-2 px-5 rounded-md hover:bg-primary-light transition-colors duration-300 ${className || ''}`;
  return <button onClick={onClick} className={buttonClasses}>{children}</button>;
}