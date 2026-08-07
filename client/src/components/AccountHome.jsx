import { allergyStatusLabel, depositStatusLabel, finalPaymentStatusLabel } from '../lib/rosterStatus.js';
import PaymentPrompt from './PaymentPrompt.jsx';

function AllergyStatus({ value }) {
  const { variant, text } = allergyStatusLabel(value);
  return <span className={`status-pill status-pill--${variant}`}>{text}</span>;
}

// Two independent pills (deposit, final) rather than one merged line — lets
// a parent see at a glance which installment still needs attention instead
// of parsing a joined sentence. Same Adult gate as PaymentPrompt (chaperones
// don't pay a trip fee) — showing a loud red "balance due" pill with no way
// to pay it would just confuse people. Both null (trip has no cost set)
// also renders nothing.
function PaymentStatus({ participant }) {
  if (participant.role === 'Adult') return null;
  const deposit = depositStatusLabel(participant.deposit_balance);
  const final = finalPaymentStatusLabel(participant.final_payment_balance);
  if (!deposit && !final) return null;
  return (
    <>
      {deposit && <span className={`status-pill status-pill--${deposit.variant}`}>{deposit.text}</span>}
      {final && <span className={`status-pill status-pill--${final.variant}`}>{final.text}</span>}
    </>
  );
}

/**
 * The account-home screen — what a signed-in parent lands on instead of
 * being dropped straight into a blank add-participant form. Adapts to
 * account state: nothing registered yet gets next-step guidance, anything
 * registered gets a roster summary with payment + allergy-info status per
 * participant. "Add another" is the only way into the participant form
 * (see RegisterPage.jsx).
 */
export default function AccountHome({ account, trip, participants, onAddAnother, onEditProfile, onEditParticipant }) {
  const hasParticipants = participants.length > 0;
  const needsReview = participants.filter((p) => p.has_allergy_medication === null);

  return (
    <div className="form-card account-home">
      <h2>Welcome back{account.parent_name ? `, ${account.parent_name.split(' ')[0]}` : ''}</h2>

      {!hasParticipants ? (
        <p className="hint">
          You haven&apos;t added anyone to {trip ? trip.name : 'this trip'} yet. Add a swimmer, diver, or
          yourself as a chaperone to get started.
        </p>
      ) : (
        <>
          <p className="hint">Your roster for {trip ? trip.name : 'this trip'}:</p>
          <ul className="account-roster">
            {participants.map((p) => (
              <li key={p.id} className="account-roster-row">
                <div className="account-roster-col account-roster-who">
                  <span className="lane-card-name">
                    {p.first_name} {p.last_name}
                  </span>
                  <span className="roster-chip-role">{p.role}</span>
                </div>
                <div className="account-roster-col account-roster-allergy">
                  <AllergyStatus value={p.has_allergy_medication} />
                </div>
                <div className="account-roster-col account-roster-payment">
                  <PaymentStatus participant={p} />
                  <PaymentPrompt participant={p} variant="compact" />
                </div>
                <div className="account-roster-col account-roster-actions">
                  <button type="button" className="link-btn" onClick={() => onEditParticipant(p)}>
                    Edit
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {needsReview.length > 0 && (
            <p className="hint account-roster-flag">
              {needsReview.length === 1
                ? "1 person on your roster hasn't answered the allergy/medication question yet."
                : `${needsReview.length} people on your roster haven't answered the allergy/medication question yet.`}
            </p>
          )}
        </>
      )}

      <div className="modal-actions account-home-actions">
        <button type="button" className="link-btn" onClick={onEditProfile}>
          Edit parent info
        </button>
        <button type="button" className="btn btn--primary" onClick={onAddAnother}>
          {hasParticipants ? 'Add another person' : 'Add a swimmer, diver, or adult'}
        </button>
      </div>
    </div>
  );
}
