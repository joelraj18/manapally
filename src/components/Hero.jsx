import GoldButton from './GoldButton';

export default function Hero({ onCreateRoom, onExplore }) {
  return (
    <section
      className="hero"
      id="top"
      aria-labelledby="hero-heading"
    >
      <div className="hero-copy">
        <p className="eyebrow hero-eyebrow">
          <span />
          A new game of legacy
        </p>

        <h1 id="hero-heading">
          Rule the table.
          <br />
          <em>Leave your mark.</em>
        </h1>

        <p className="hero-description">
          A royal strategy board game inspired by the grandeur of
          South India. Gather your circle, build your legacy, and let
          every move matter.
        </p>

        <div className="hero-actions">
          <GoldButton icon="✦" onClick={onCreateRoom}>
            Create a private room
          </GoldButton>

          <GoldButton variant="ghost" icon="↓" onClick={onExplore}>
            Discover Manapally
          </GoldButton>
        </div>

        <div className="hero-proof" aria-label="Game facts">
          <span>
            <strong>2–4</strong> players
          </span>

          <i />

          <span>
            <strong>18</strong> rounds
          </span>

          <i />

          <span>
            <strong>1</strong> shared legacy
          </span>
        </div>
      </div>

      <div
        className="hero-art"
        role="img"
        aria-label="A stylised Manapally game board"
      >
        <div className="halo" />

        <div className="arch arch--outer">
          <div className="arch arch--inner" />
        </div>

        <div className="board-diorama">
          <div className="board-corner board-corner--tl" />
          <div className="board-corner board-corner--tr" />
          <div className="board-corner board-corner--bl" />
          <div className="board-corner board-corner--br" />

          <div className="board-path" />

          <div className="board-centre">
            <span>MANAPALLY</span>
            <small>EST. IN LEGACY</small>
            <b>✦</b>
          </div>

          <div className="token token--elephant">♞</div>
          <div className="token token--bell">♢</div>
        </div>

        <p className="art-caption">
          A royal game night, reimagined
        </p>
      </div>
    </section>
  );
}