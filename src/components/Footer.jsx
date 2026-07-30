import GoldButton from './GoldButton';

export default function Footer({ onJoin }) {
  return (
    <footer className="footer">
      <div className="footer-brand">
        <span className="brand-mark">M</span>
        <span>MANAPALLY</span>
      </div>

      <p>Royal strategy, beautifully played.</p>

      <GoldButton variant="ghost" size="small" onClick={onJoin}>
        Join the first season <span aria-hidden="true">→</span>
      </GoldButton>

      <small>
        © {new Date().getFullYear()} Manapally. Crafted with intention.
      </small>
    </footer>
  );
}