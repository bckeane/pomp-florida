import { useState } from 'react';
import { formatLongDate } from '../lib/dates.js';
import { fmtMoney } from '../lib/money.js';
import { renderMarkdownInline } from '../lib/markdown.js';
import Markdown from './Markdown.jsx';

function splitLines(text) {
  return (text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Strips this app's supported markdown (bold, italic, [text](url) links)
 * down to plain text, for the copy/mailto exports — an email client pasted
 * into won't render the markup, so leaving it in would just show the
 * asterisks and brackets literally. */
function stripMarkdown(text) {
  return (text || '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1');
}

function formatCostRange(low, high) {
  if (low == null && high == null) return null;
  if (low != null && high != null && low !== high) return `${fmtMoney(low)}–${fmtMoney(high)}`;
  return fmtMoney(low ?? high);
}

/** Builds the plain-text version of the announcement for the copy button and
 * the mailto link — same content the preview below renders, just flattened
 * to text an email client can paste/send as-is. */
function buildAnnouncementText(trip, registerUrl) {
  const included = splitLines(trip.whats_included);
  const coordinators = splitLines(trip.coordinators);
  const costRange = formatCostRange(trip.cost_low, trip.cost_high);

  const blocks = [];

  blocks.push('Dear Panthers & Parents,');
  blocks.push(`We are thrilled to announce the ${trip.year} Florida Swim Trip!`);
  if (trip.intro_message) blocks.push(stripMarkdown(trip.intro_message));

  const commitLines = ['📌 COMMITMENT DEADLINE'];
  if (trip.commitment_deadline) {
    commitLines.push(
      `Register${trip.deposit_amount != null ? ` & pay your deposit (${fmtMoney(trip.deposit_amount)})` : ''} by ${formatLongDate(trip.commitment_deadline)}`
    );
  }
  commitLines.push('Hard deadline — no late commitments or additional swimmers can be added afterward.');
  blocks.push(commitLines.join('\n'));

  const ctaLines = ['Ready to commit? Register your swimmer here:', registerUrl];
  if (trip.payment_notes) ctaLines.push(stripMarkdown(trip.payment_notes));
  blocks.push(ctaLines.join('\n'));

  blocks.push(
    [
      'Not attending? No problem — practices continue locally as normal.',
      trip.contact_email ? `Questions? Email ${trip.contact_email}.` : 'Questions? Reach out to a trip coordinator.',
    ].join('\n')
  );

  const whereLines = ['📍 WHERE ARE WE GOING?'];
  if (trip.training_location) {
    whereLines.push(`Training: ${trip.training_location}${trip.training_location_url ? ` (${trip.training_location_url})` : ''}`);
  }
  if (trip.lodging) {
    whereLines.push(`Lodging: ${trip.lodging}${trip.lodging_url ? ` (${trip.lodging_url})` : ''}`);
  }
  if (trip.meals_info) whereLines.push(`Meals: ${stripMarkdown(trip.meals_info)}`);
  if (whereLines.length > 1) blocks.push(whereLines.join('\n'));

  const whenLines = ['🗓 WHEN?'];
  if (trip.trip_date) {
    whenLines.push(`Departure: ${formatLongDate(trip.trip_date)}${trip.departure_logistics ? ` — ${stripMarkdown(trip.departure_logistics)}` : ''}`);
  }
  if (trip.return_date) {
    whenLines.push(`Return: ${formatLongDate(trip.return_date)}${trip.return_logistics ? ` — ${stripMarkdown(trip.return_logistics)}` : ''}`);
  }
  if (trip.miss_school_note) whenLines.push(`Note: ${trip.miss_school_note}`);
  if (whenLines.length > 1) blocks.push(whenLines.join('\n'));

  if (included.length > 0) {
    blocks.push(['💡 WHAT’S INCLUDED', ...included.map((line) => `- ${stripMarkdown(line)}`)].join('\n'));
  }

  const costLines = ['💲 COST & PAYMENTS'];
  if (costRange) costLines.push(`Estimated total: ${costRange}`);
  if (trip.deposit_amount != null) {
    costLines.push(
      `Deposit (${trip.deposit_percent ?? 60}%): ${fmtMoney(trip.deposit_amount)}${trip.commitment_deadline ? ` — due ${formatLongDate(trip.commitment_deadline)}` : ''}`
    );
  }
  if (trip.final_payment_estimate != null) {
    costLines.push(
      `Final payment (${100 - (trip.deposit_percent ?? 60)}%): ~${fmtMoney(trip.final_payment_estimate)}${trip.final_payment_due ? ` — due ${formatLongDate(trip.final_payment_due)}` : ''}`
    );
  }
  if (costLines.length > 1) blocks.push(costLines.join('\n'));

  if (coordinators.length > 0) {
    blocks.push(['👥 TRIP COORDINATORS', ...coordinators.map(stripMarkdown)].join('\n'));
  }

  blocks.push('Thank you — we can’t wait for another great trip!');

  return blocks.join('\n\n');
}

/** Which trip-detail fields this announcement draws on but the current trip
 * doesn't have filled in yet — surfaced so an admin knows what to add on the
 * Trip details tab before sending, without this tab writing anything itself. */
function missingFields(trip) {
  const missing = [];
  if (!trip.intro_message) missing.push('Intro message');
  if (!trip.commitment_deadline) missing.push('Commitment deadline');
  if (!trip.estimated_cost) missing.push('Estimated cost');
  if (!trip.departure_logistics) missing.push('Departure logistics');
  if (!trip.return_logistics) missing.push('Return logistics');
  if (!trip.payment_notes) missing.push('Payment instructions');
  if (!trip.whats_included) missing.push("What's included");
  if (!trip.coordinators) missing.push('Trip coordinators');
  return missing;
}

/**
 * Generates the family-facing "sign-ups are open" announcement email from
 * the current trip's real details, instead of hand-editing a copy of last
 * year's letter. Read-only against trip data — everything it renders comes
 * from the Trip details tab, so keeping the announcement in sync with a new
 * year is just updating trip details, not this letter. The CTA points at
 * this site's live registration flow rather than "reply to this email",
 * since self-serve registration + payment didn't exist when the process
 * that inspired this letter was designed.
 */
export default function AnnouncementPanel({ trip }) {
  const [copied, setCopied] = useState(false);

  if (!trip) return <div className="form-card"><p className="hint">Select a trip first.</p></div>;

  const registerUrl = `${window.location.origin}/register`;
  const included = splitLines(trip.whats_included);
  const coordinators = splitLines(trip.coordinators);
  const costRange = formatCostRange(trip.cost_low, trip.cost_high);
  const missing = missingFields(trip);
  const text = buildAnnouncementText(trip, registerUrl);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mailtoHref = `mailto:?subject=${encodeURIComponent(`${trip.name} — Sign-Ups Are Open!`)}&body=${encodeURIComponent(text)}`;

  return (
    <section className="form-card announcement-panel">
      <div className="announcement-panel__header">
        <div>
          <h2>Announcement</h2>
          <p className="hint">
            The sign-up email for {trip.name}, generated from the Trip details tab — send this out to
            kick off registration.
          </p>
        </div>
        <div className="announcement-panel__actions">
          <button type="button" className="btn btn--ghost" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy announcement text'}
          </button>
          <a className="btn btn--primary" href={mailtoHref}>
            Open in email app
          </a>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="banner banner--warning announcement-panel__missing">
          Not filled in yet on Trip details, so these sections are skipped below: {missing.join(', ')}.
        </div>
      )}

      <article className="announcement-letter">
        <p>Dear Panthers &amp; Parents,</p>
        <p>We are thrilled to announce the {trip.year} Florida Swim Trip!</p>
        {trip.intro_message && <Markdown className="markdown-body" content={trip.intro_message} />}

        <h3>📌 Commitment deadline</h3>
        {trip.commitment_deadline && (
          <p>
            Register{trip.deposit_amount != null ? ` & pay your deposit (${fmtMoney(trip.deposit_amount)})` : ''} by{' '}
            <strong>{formatLongDate(trip.commitment_deadline)}</strong>.
          </p>
        )}
        <p className="hint">Hard deadline — no late commitments or additional swimmers can be added afterward.</p>
        <p>
          Ready to commit? <a href={registerUrl}>Register your swimmer here</a>.
        </p>
        {trip.payment_notes && <Markdown className="markdown-body hint" content={trip.payment_notes} />}

        {(trip.training_location || trip.lodging) && (
          <>
            <h3>📍 Where are we going?</h3>
            <ul>
              {trip.training_location && (
                <li>
                  Training:{' '}
                  {trip.training_location_url ? (
                    <a href={trip.training_location_url} target="_blank" rel="noreferrer">
                      {trip.training_location}
                    </a>
                  ) : (
                    trip.training_location
                  )}
                </li>
              )}
              {trip.lodging && (
                <li>
                  Lodging:{' '}
                  {trip.lodging_url ? (
                    <a href={trip.lodging_url} target="_blank" rel="noreferrer">
                      {trip.lodging}
                    </a>
                  ) : (
                    trip.lodging
                  )}
                </li>
              )}
              {trip.meals_info && (
                <li>
                  Meals: <span dangerouslySetInnerHTML={{ __html: renderMarkdownInline(trip.meals_info) }} />
                </li>
              )}
            </ul>
          </>
        )}

        {(trip.trip_date || trip.return_date) && (
          <>
            <h3>🗓 When?</h3>
            <ul>
              {trip.trip_date && (
                <li>
                  Departure: {formatLongDate(trip.trip_date)}
                  {trip.departure_logistics && (
                    <>
                      {' — '}
                      <span dangerouslySetInnerHTML={{ __html: renderMarkdownInline(trip.departure_logistics) }} />
                    </>
                  )}
                </li>
              )}
              {trip.return_date && (
                <li>
                  Return: {formatLongDate(trip.return_date)}
                  {trip.return_logistics && (
                    <>
                      {' — '}
                      <span dangerouslySetInnerHTML={{ __html: renderMarkdownInline(trip.return_logistics) }} />
                    </>
                  )}
                </li>
              )}
            </ul>
            {trip.miss_school_note && <p className="hint">⚠️ {trip.miss_school_note}</p>}
          </>
        )}

        {included.length > 0 && (
          <>
            <h3>💡 What&rsquo;s included</h3>
            <ul>
              {included.map((line, i) => (
                <li key={i} dangerouslySetInnerHTML={{ __html: renderMarkdownInline(line) }} />
              ))}
            </ul>
          </>
        )}

        {(costRange || trip.deposit_amount != null) && (
          <>
            <h3>💲 Cost &amp; payments</h3>
            <ul>
              {costRange && <li>Estimated total: {costRange}</li>}
              {trip.deposit_amount != null && (
                <li>
                  Deposit ({trip.deposit_percent ?? 60}%): {fmtMoney(trip.deposit_amount)}
                  {trip.commitment_deadline ? ` — due ${formatLongDate(trip.commitment_deadline)}` : ''}
                </li>
              )}
              {trip.final_payment_estimate != null && (
                <li>
                  Final payment ({100 - (trip.deposit_percent ?? 60)}%): ~{fmtMoney(trip.final_payment_estimate)}
                  {trip.final_payment_due ? ` — due ${formatLongDate(trip.final_payment_due)}` : ''}
                </li>
              )}
            </ul>
          </>
        )}

        {coordinators.length > 0 && (
          <>
            <h3>👥 Trip coordinators</h3>
            <ul>
              {coordinators.map((name, i) => (
                <li key={i} dangerouslySetInnerHTML={{ __html: renderMarkdownInline(name) }} />
              ))}
            </ul>
            {trip.contact_email && <p className="hint">Questions? Email {trip.contact_email}.</p>}
          </>
        )}

        <p>Thank you — we can&rsquo;t wait for another great trip!</p>
      </article>
    </section>
  );
}
