import { useState } from 'react';
import { TOTAL_MATCH_TURNS } from '../Game/matchRules';

const questions = [
  {
    q: 'Do I need an account to play?',
    a: 'No account is needed, enter a display name in the lobby and you are ready to start',
  },
  {
    q: 'Can I play on my own?',
    a: 'Yes, add computer opponents to any open seat in your room, or premium AI opponents if you have a Claude API key',
  },
  {
    q: 'Can friends join my room?',
    a: 'Yes, share your six character room code and friends anywhere join from the lobby with Join room, then chat with the table while you play',
  },
  {
    q: 'How long does a match last?',
    a: `A match is ${TOTAL_MATCH_TURNS} completed turns shared by the whole table, AI turns resolve in a couple of seconds so most of the time is yours to plan`,
  },
  {
    q: 'How is the winner decided?',
    a: `The highest total net worth wins, cash plus the value of every property held, when all ${TOTAL_MATCH_TURNS} turns are played, when every other player is bankrupt, or when everyone at the table agrees to end the game`,
  },
  {
    q: 'Can I play on my phone?',
    a: 'Yes, the layout adapts to any screen and on narrow phones the board scrolls sideways so every space stays readable',
  },
  {
    q: 'How do I turn the music on or off?',
    a: 'Tap the speaker button at the top of the home page or the game to open the sound panel, music and sound effects each have their own switch and volume slider',
  },
];

export default function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <section className="home-section home-section--white" id="faq" aria-labelledby="faq-heading">
      <div className="section-inner section-inner--narrow">
        <header className="section-head reveal">
          <h2 id="faq-heading">
            Questions <span>Answers</span>
          </h2>
        </header>

        <div className="faq-list reveal">
          {questions.map((item, index) => {
            const isOpen = open === index;
            const panelId = `faq-panel-${index}`;

            return (
              <div className={`faq-item ${isOpen ? 'faq-item--open' : ''}`} key={item.q}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? -1 : index)}
                  >
                    <span>{item.q}</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="faq-toggle">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                </h3>

                <div className="faq-panel" id={panelId} role="region">
                  <div>
                    <p>{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
