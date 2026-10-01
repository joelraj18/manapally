import Carousel from '../../components/Carousel';
import Icon from '../../components/Icon';
import { routeDetails, utilityDetails } from '../Game/estate';
import { START_REWARD } from '../Game/matchRules';

const rupees = (amount) => `₹${amount.toLocaleString('en-IN')}`;

const guide = [
  {
    icon: 'crown',
    tone: 'sage',
    title: 'Rajyabhishekam',
    kicker: 'The coronation corner',
    text: `Every journey starts here, pass or land on it to collect ${rupees(START_REWARD)}`,
  },
  {
    icon: 'building',
    tone: 'district',
    title: 'Districts',
    kicker: '22 streets in 8 colour families',
    text: 'Buy them as you land, own a full family to start building houses and finally a hotel',
  },
  {
    icon: 'train',
    tone: 'route',
    title: 'Express routes',
    kicker: `4 routes at ${rupees(routeDetails.price)} each`,
    text: `Rent doubles with every route you hold, from ${rupees(routeDetails.rent[0])} up to ${rupees(
      routeDetails.rent[3],
    )} for all four`,
  },
  {
    icon: 'bolt',
    tone: 'utility',
    title: 'Utilities',
    kicker: 'Kaveri Power and Tungabhadra Water',
    text: `Rent is ${utilityDetails.multipliers[0]} times the dice roll × ${rupees(
      utilityDetails.perPip,
    )}, rising to ${utilityDetails.multipliers[1]} times when one player owns both`,
  },
  {
    icon: 'scroll',
    tone: 'order',
    title: "Raja's Order",
    kicker: 'A royal decree',
    text: 'Draw a card that may move you across the board, reward you or send you to Kaidi Kottai',
  },
  {
    icon: 'temple',
    tone: 'hundi',
    title: 'Temple Hundi',
    kicker: 'The offering box',
    text: 'Mostly blessings and windfalls, with the occasional fee to keep you humble',
  },
  {
    icon: 'fort',
    tone: 'fort',
    title: 'Kaidi Kottai',
    kicker: 'The fort prison',
    text: 'Usually you are just visiting, but three doubles in a row or the wrong card will send you there',
  },
  {
    icon: 'leaf',
    tone: 'rest',
    title: 'Ambari Vishram',
    kicker: 'The royal rest stop',
    text: 'A calm corner where nothing is owed, catch your breath before the costly streets ahead',
  },
];

export default function BoardGuide() {
  return (
    <section className="home-section home-section--shelf" id="board-guide" aria-labelledby="guide-heading">
      <div className="section-inner">
        <header className="section-head reveal">
          <h2 id="guide-heading">
            Know the board <span>Every space, explained</span>
          </h2>
        </header>
      </div>

      <Carousel label="Board spaces" className="reveal">
        {guide.map((entry) => (
          <article className={`carousel-item guide-card guide-card--${entry.tone}`} key={entry.title}>
            <span className="guide-card-icon">
              <Icon name={entry.icon} size={30} />
            </span>
            <p className="guide-card-kicker">{entry.kicker}</p>
            <h3>{entry.title}</h3>
            <p className="guide-card-text">{entry.text}</p>
          </article>
        ))}
      </Carousel>
    </section>
  );
}
