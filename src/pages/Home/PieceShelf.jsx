import Carousel from '../../components/Carousel';
import GoldButton from '../../components/GoldButton';
import { PIECES, PIECE_ORDER, PieceMark } from '../Game/pieces.jsx';

const pieceStories = {
  lamp: {
    title: 'Deepam',
    seat: 'Emerald seat',
    story: 'The lamp that lights the way, for players who like to lead from the front',
  },
  temple: {
    title: 'Gopuram',
    seat: 'Ruby seat',
    story: 'The temple tower, steady and patient, made for long term plans',
  },
  elephant: {
    title: 'Gaja',
    seat: 'Saffron seat',
    story: 'The royal elephant, bold and powerful, built for big purchases',
  },
  bell: {
    title: 'Ghanta',
    seat: 'Indigo seat',
    story: 'The temple bell, quick and alert, for players who read the room',
  },
};

export default function PieceShelf({ onPlay }) {
  return (
    <section className="home-section home-section--shelf" id="pieces" aria-labelledby="pieces-heading">
      <div className="section-inner">
        <header className="section-head reveal">
          <h2 id="pieces-heading">
            All pieces <span>Take your pick</span>
          </h2>
        </header>
      </div>

      <Carousel label="Choose a piece" className="reveal">
        {PIECE_ORDER.map((key) => {
          const piece = PIECES[key];
          const story = pieceStories[key];

          return (
            <article className="carousel-item piece-card" key={key} style={{ '--piece': piece.colour }}>
              <h3>{story.title}</h3>
              <p className="piece-card-label">The {piece.name}</p>

              <div className="piece-card-visual">
                <span className="piece-card-halo" aria-hidden="true" />
                <PieceMark piece={key} variant="token" title={piece.label} />
              </div>

              <ul className="piece-card-swatches" aria-label="Seat colours">
                {PIECE_ORDER.map((swatch) => (
                  <li
                    key={swatch}
                    className={swatch === key ? 'is-current' : ''}
                    style={{ '--swatch': PIECES[swatch].colour }}
                    title={PIECES[swatch].label}
                  />
                ))}
              </ul>

              <p className="piece-card-story">{story.story}</p>

              <div className="piece-card-foot">
                <span>{story.seat}</span>
                <GoldButton size="small" onClick={() => onPlay(key)}>
                  Play
                </GoldButton>
              </div>
            </article>
          );
        })}

        <article className="carousel-item piece-card piece-card--note">
          <p className="eyebrow">Fair for everyone</p>
          <h3>Which piece is right for you</h3>
          <p className="piece-card-story">
            Every piece plays by exactly the same rules and odds, so choose the one that
            feels like you and let your strategy do the rest
          </p>
          <GoldButton variant="ghost" size="small" onClick={() => onPlay('lamp')}>
            Start with Deepam
          </GoldButton>
        </article>
      </Carousel>
    </section>
  );
}
