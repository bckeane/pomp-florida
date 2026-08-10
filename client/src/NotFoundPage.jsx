import { Link } from 'react-router';
import { useDocumentTitle } from './lib/useDocumentTitle.js';
import pantherLogo from './img/pomp_icon.png';
import './home.css';

export default function NotFoundPage() {
  useDocumentTitle('Page Not Found');

  return (
    <div className="home-page home-page--empty">
      <img className="hero-logo" src={pantherLogo} alt="Pomperaug Panthers" />
      <p className="eyebrow">Pomperaug Panthers Swim &amp; Dive</p>
      <h1 className="hero-title">Page not found</h1>
      <p className="hint">That page doesn&apos;t exist, or the link may be out of date.</p>
      <Link className="btn btn--primary btn--lg" to="/">
        Back to home
      </Link>
    </div>
  );
}
