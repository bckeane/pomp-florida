import { Link } from 'react-router';
import { useDocumentTitle } from './lib/useDocumentTitle.js';
import pantherLogo from './img/pomp_icon.png';
import './home.css';
import './legal.css';

const EFFECTIVE_DATE = 'August 13, 2026';
const CONTACT_EMAIL = 'bckeane@gmail.com';

export default function PrivacyPage() {
  useDocumentTitle('Privacy Policy');

  return (
    <div className="home-page legal-page">
      <header className="hero hero--legal">
        <img className="hero-logo" src={pantherLogo} alt="Pomperaug Panthers" />
        <p className="eyebrow">Pomperaug Panthers Swim &amp; Dive</p>
        <h1 className="hero-title">Privacy Policy</h1>
        <p className="hint">Effective {EFFECTIVE_DATE}</p>
      </header>

      <div className="lane-divider" aria-hidden="true" />

      <section className="section legal-section">
        <p>
          This site is run by volunteer coordinators of the Pomperaug Panthers Swim &amp; Dive team to
          organize the team&rsquo;s Florida trip: collecting registrations, tracking payments, and answering
          questions. It is not a commercial product, and information collected here is used only to run
          the trip.
        </p>

        <h2 className="section-title">Information we collect</h2>
        <ul>
          <li>
            <strong>Account information</strong> &mdash; the email address and password (stored as a
            salted hash, never in plain text) used to sign in and register participants.
          </li>
          <li>
            <strong>Participant information</strong> &mdash; entered by a parent or guardian when
            registering a swimmer or diver: first and last name, birth date, grad year, role
            (Swimmer/Diver/Adult), and whether the participant has an allergy or medication the trip
            coordinators should be aware of.
          </li>
          <li>
            <strong>Payment information</strong> &mdash; when you pay a deposit or balance, card details
            are entered directly into Stripe&rsquo;s checkout page and never touch our servers. We keep a
            record of the payment amount and status so we can track who has paid.
          </li>
          <li>
            <strong>FAQ questions</strong> &mdash; questions submitted through the FAQ page, along with an
            optional name, so coordinators can answer them.
          </li>
        </ul>

        <h2 className="section-title">Who we share it with</h2>
        <p>We don&rsquo;t sell or rent data, and we don&rsquo;t use it for advertising. We share it only with:</p>
        <ul>
          <li>
            <strong>Stripe</strong>, to process trip payments.
          </li>
          <li>
            <strong>Resend</strong>, to deliver account emails such as password resets.
          </li>
        </ul>
        <p>
          Both process data on our behalf under their own privacy policies and don&rsquo;t use it for their
          own marketing.
        </p>

        <h2 className="section-title">Children&rsquo;s information</h2>
        <p>
          Many participants are minors. Their information is entered by a parent or guardian through that
          adult&rsquo;s account &mdash; students don&rsquo;t create their own accounts or submit their own
          data. A parent or guardian can review, correct, or ask us to delete their child&rsquo;s
          information at any time by contacting us below.
        </p>

        <h2 className="section-title">Cookies</h2>
        <p>
          The site sets one cookie to keep you signed in. We don&rsquo;t use analytics or advertising
          cookies, and nothing on this site tracks you across other sites.
        </p>

        <h2 className="section-title">How long we keep it</h2>
        <p>
          Roster and payment records are kept for as long as needed to plan the current and upcoming trips.
          You can ask us to delete your account and associated participant records once a trip is over.
        </p>

        <h2 className="section-title">Your choices</h2>
        <p>
          To review, correct, or delete the information tied to your account, or to ask a question about
          this policy, contact a trip coordinator at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> or through the{' '}
          <Link to="/faq">FAQ page</Link>.
        </p>

        <h2 className="section-title">Changes</h2>
        <p>
          If this policy changes, we&rsquo;ll update the effective date above. Material changes affecting
          how participant data is used will be announced to registered families.
        </p>
      </section>

      <footer className="home-footer">
        <Link className="btn btn--ghost" to="/">
          Back to home
        </Link>
      </footer>
    </div>
  );
}
