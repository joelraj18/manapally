import { useEffect, useState } from 'react';

export default function LoadingScreen({ onComplete }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((currentProgress) => {
        if (currentProgress >= 100) {
          window.clearInterval(timer);

          window.setTimeout(() => {
            onComplete();
          }, 220);

          return 100;
        }

        return Math.min(100, currentProgress + 5);
      });
    }, 32);

    return () => {
      window.clearInterval(timer);
    };
  }, [onComplete]);

  return (
    <div className="loading-screen">
      <div className="loading-monogram">M</div>

      <p>PREPARING THE COURT</p>

      <div
        className="loading-track"
        role="progressbar"
        aria-label="Loading Manapally"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      <small>{progress}%</small>
    </div>
  );
}