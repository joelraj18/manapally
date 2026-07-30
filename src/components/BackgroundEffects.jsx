import FloatingParticles from './FloatingParticles';

export default function BackgroundEffects() {
  return (
    <div className="background-effects" aria-hidden="true">
      <div className="marble-vein marble-vein--one" />
      <div className="marble-vein marble-vein--two" />

      <div className="emerald-orb emerald-orb--one" />
      <div className="emerald-orb emerald-orb--two" />

      <div className="grain" />

      <FloatingParticles count={28} />
    </div>
  );
}