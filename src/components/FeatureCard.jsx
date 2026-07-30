export default function FeatureCard({
    number,
    title,
    description,
    symbol,
  }) {
    return (
      <article className="feature-card reveal">
        <span className="feature-number">{number}</span>
  
        <span className="feature-symbol" aria-hidden="true">
          {symbol}
        </span>
  
        <h3>{title}</h3>
  
        <p>{description}</p>
  
        <span className="feature-line" />
      </article>
    );
  }