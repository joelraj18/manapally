const particleStyle = (index) => ({
    '--x': `${(index * 37) % 100}%`,
    '--y': `${(index * 61) % 100}%`,
    '--size': `${2 + (index % 4)}px`,
    '--delay': `${(index % 11) * -1.12}s`,
    '--duration': `${12 + (index % 7) * 2}s`,
    '--drift': `${18 + (index % 5) * 8}px`,
  });
  
  export default function FloatingParticles({ count = 20 }) {
    return (
      <div className="particles">
        {Array.from({ length: count }, (_, index) => (
          <span
            className="particle"
            key={index}
            style={particleStyle(index)}
          />
        ))}
      </div>
    );
  }