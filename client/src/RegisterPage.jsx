import { useEffect, useState } from 'react';
import ParticipantForm from './components/ParticipantForm.jsx';
import { createParticipant } from './api/participants.js';
import { fetchCurrentTrip } from './api/trips.js';

export default function RegisterPage() {
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchCurrentTrip()
      .then(setTrip)
      .catch(() => setError('Could not reach the server.'));
  }, []);

  const handleSave = async (data) => {
    await createParticipant(data);
    setSubmitted(true);
  };

  return (
    <div className="register-page">
      <header className="register-header">
        <h1>{trip ? trip.name : 'Trip'} Registration</h1>
        <p className="subtitle">Add a swimmer, diver, or adult to the roster.</p>
      </header>

      {error && <div className="banner banner--error">{error}</div>}

      {submitted ? (
        <div className="form-card register-success">
          <p>Thanks — you've been added to the roster.</p>
          <button className="btn btn--primary" onClick={() => setSubmitted(false)}>
            Add another person
          </button>
        </div>
      ) : (
        trip && <ParticipantForm variant="public" tripYear={trip.year} onSave={handleSave} />
      )}
    </div>
  );
}
