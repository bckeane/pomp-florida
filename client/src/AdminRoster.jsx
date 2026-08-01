import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SummaryBar from './components/SummaryBar.jsx';
import RosterTable from './components/RosterTable.jsx';
import ParticipantForm from './components/ParticipantForm.jsx';
import ImportScreen from './components/ImportScreen.jsx';
import TripSwitcher from './components/TripSwitcher.jsx';
import TripDetailsForm from './components/TripDetailsForm.jsx';
import BudgetPanel from './components/BudgetPanel.jsx';
import AuthGate from './components/AuthGate.jsx';
import ManageAdmins from './components/ManageAdmins.jsx';
import { me, logout } from './api/auth.js';
import {
  fetchParticipants,
  fetchStats,
  createParticipant,
  updateParticipant,
  deleteParticipant,
  exportUrl,
} from './api/participants.js';
import { fetchTrips } from './api/trips.js';
import pantherLogo from './img/pomp_icon.png';
import './admin.css';

const defaultFilters = {
  q: '',
  role: '',
  grad_year: '',
  sort: 'last_name',
  showInactive: false,
};

export default function AdminRoster() {
  const [account, setAccount] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // participant or 'new' or null
  const [showImport, setShowImport] = useState(false);
  const [showManageAdmins, setShowManageAdmins] = useState(false);
  const [showTripDetails, setShowTripDetails] = useState(false);
  const [activeTab, setActiveTab] = useState('roster');

  const isAdmin = account?.role === 'admin';

  useEffect(() => {
    me()
      .then(({ account }) => setAccount(account))
      .catch(() => setAccount(null))
      .finally(() => setCheckingSession(false));
  }, []);

  const loadTrips = useCallback(async (preferredTripId) => {
    const list = await fetchTrips();
    setTrips(list);
    const target =
      list.find((t) => t.id === preferredTripId) || list.find((t) => t.is_current) || list[0];
    setSelectedTripId(target ? target.id : null);
    return target;
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadTrips().catch(() => setError('Could not reach the server. Is the API running?'));
  }, [isAdmin, loadTrips]);

  const load = useCallback(async () => {
    if (!selectedTripId) return;
    setLoading(true);
    setError(null);
    try {
      const [list, statsData] = await Promise.all([
        fetchParticipants({
          trip_id: selectedTripId,
          q: filters.q,
          role: filters.role,
          grad_year: filters.grad_year,
          sort: filters.sort,
          active: filters.showInactive ? undefined : '1',
        }),
        fetchStats(selectedTripId),
      ]);
      setParticipants(list);
      setStats(statsData);
    } catch (err) {
      setError('Could not reach the server. Is the API running?');
    } finally {
      setLoading(false);
    }
  }, [filters, selectedTripId]);

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin, load]);

  const gradYears = useMemo(() => {
    const years = new Set();
    participants.forEach((p) => {
      if (p.grad_year && !Number.isNaN(Number(p.grad_year))) years.add(p.grad_year);
    });
    return Array.from(years).sort();
  }, [participants]);

  const handleSave = async (data) => {
    if (editing && editing !== 'new') {
      await updateParticipant(editing.id, data);
    } else {
      await createParticipant(data, selectedTripId);
    }
    setEditing(null);
    await load();
  };

  const handleToggleActive = async (participant) => {
    if (participant.active) {
      await deleteParticipant(participant.id);
    } else {
      await updateParticipant(participant.id, { active: true });
    }
    await load();
  };

  const handleTripsChanged = async (preferredTripId) => {
    await loadTrips(preferredTripId);
  };

  const handleTripDetailsSaved = async () => {
    setShowTripDetails(false);
    await loadTrips(selectedTripId);
  };

  const handleLogout = async () => {
    await logout();
    setAccount(null);
  };

  if (checkingSession) {
    return (
      <div className="app">
        <p className="hint">Loading…</p>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="admin-auth-page">
        <header className="register-header">
          <img className="reg-logo" src={pantherLogo} alt="Pomperaug Panthers" />
          <h1>Admin sign in</h1>
        </header>
        <AuthGate
          allowSignup={false}
          description="Sign in with your admin account to manage the roster."
          onAuthenticated={setAccount}
        />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="admin-auth-page">
        <header className="register-header">
          <img className="reg-logo" src={pantherLogo} alt="Pomperaug Panthers" />
          <h1>Admin sign in</h1>
        </header>
        <div className="form-card">
          <p>
            Signed in as {account.email}, but this account doesn't have admin access.
          </p>
          <button type="button" className="btn btn--primary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
    );
  }

  const selectedTrip = trips.find((t) => t.id === selectedTripId);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <img className="app-logo" src={pantherLogo} alt="" />
          <div>
            <h1>{selectedTrip ? selectedTrip.name : 'Florida Trip'}</h1>
            <p className="subtitle">{activeTab === 'budget' ? 'Budget' : 'Roster'}</p>
          </div>
        </div>
        <div className="header-actions">
          <Link className="btn btn--ghost" to="/">
            Home page
          </Link>
          <Link className="btn btn--ghost" to="/register">
            Registration form
          </Link>
          {selectedTrip && (
            <button className="btn btn--ghost" onClick={() => setShowTripDetails(true)}>
              Edit trip details
            </button>
          )}
          {activeTab === 'roster' && (
            <>
              <button className="btn btn--ghost" onClick={() => setShowImport(true)}>
                Bulk import
              </button>
              <a className="btn btn--ghost" href={exportUrl(selectedTripId)} download>
                Export CSV
              </a>
              <button className="btn btn--primary" onClick={() => setEditing('new')}>
                Add participant
              </button>
            </>
          )}
        </div>
      </header>

      <div className="account-bar">
        <span>Signed in as {account.email} (admin)</span>
        <span>
          <button type="button" className="link-btn" onClick={() => setShowManageAdmins(true)}>
            Manage admins
          </button>
          {' · '}
          <button type="button" className="link-btn" onClick={handleLogout}>
            Log out
          </button>
        </span>
      </div>

      <TripSwitcher
        trips={trips}
        selectedTripId={selectedTripId}
        onSelectTrip={setSelectedTripId}
        onTripsChanged={handleTripsChanged}
      />

      <SummaryBar stats={stats} />

      {selectedTrip && (
        <div className="segmented" style={{ maxWidth: 280, marginBottom: '1rem' }}>
          <button
            type="button"
            className={`segmented-btn ${activeTab === 'roster' ? 'segmented-btn--active' : ''}`}
            onClick={() => setActiveTab('roster')}
          >
            Roster
          </button>
          <button
            type="button"
            className={`segmented-btn ${activeTab === 'budget' ? 'segmented-btn--active' : ''}`}
            onClick={() => setActiveTab('budget')}
          >
            Budget
          </button>
        </div>
      )}

      {error && <div className="banner banner--error">{error}</div>}

      {activeTab === 'budget' && selectedTrip ? (
        <BudgetPanel tripId={selectedTrip.id} />
      ) : loading && !participants.length ? (
        <p className="hint">Loading roster…</p>
      ) : (
        <RosterTable
          participants={participants}
          filters={filters}
          onFiltersChange={setFilters}
          onEdit={setEditing}
          onDelete={handleToggleActive}
          gradYears={gradYears}
        />
      )}

      {editing && (
        <ParticipantForm
          participant={editing === 'new' ? null : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {showImport && (
        <ImportScreen
          tripId={selectedTripId}
          onClose={() => setShowImport(false)}
          onImported={load}
        />
      )}

      {showManageAdmins && <ManageAdmins onClose={() => setShowManageAdmins(false)} />}

      {showTripDetails && selectedTrip && (
        <TripDetailsForm
          trip={selectedTrip}
          onSaved={handleTripDetailsSaved}
          onCancel={() => setShowTripDetails(false)}
        />
      )}
    </div>
  );
}
