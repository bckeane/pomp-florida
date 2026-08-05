import { allergyStatusLabel, paymentStatusText } from '../lib/rosterStatus.js';

function AllergyStatus({ value }) {
  const { variant, text } = allergyStatusLabel(value);
  return <span className={`status-pill status-pill--${variant}`}>{text}</span>;
}

function PaymentStatus({ participant }) {
  const text = paymentStatusText(participant);
  if (!text) return null;
  return <span className="hint">{text}</span>;
}

/**
 * The account-home screen — what a signed-in parent lands on instead of
 * being dropped straight into a blank add-participant form. Adapts to
 * account state: nothing registered yet gets next-step guidance, anything
 * registered gets a roster summary with payment + allergy-info status per
 * participant. "Add another" is the only way into the participant form
 * (see RegisterPage.jsx).
 */
export default function AccountHome({ account, trip, participants, onAddAnother, onEditProfile }) {
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
                <div className="account-roster-who">
                  <span className="lane-card-name">
                    {p.first_name} {p.last_name}
                  </span>
                  <span className="roster-chip-role">{p.role}</span>
                </div>
                <div className="account-roster-status">
                  <AllergyStatus value={p.has_allergy_medication} />
                  <PaymentStatus participant={p} />
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
