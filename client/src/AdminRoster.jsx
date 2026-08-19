import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import OverviewPanel from './components/OverviewPanel.jsx';
import RosterTable from './components/RosterTable.jsx';
import ParticipantForm from './components/ParticipantForm.jsx';
import ImportScreen from './components/ImportScreen.jsx';
import TripSwitcher from './components/TripSwitcher.jsx';
import TripDetailsForm from './components/TripDetailsForm.jsx';
import AnnouncementPanel from './components/AnnouncementPanel.jsx';
import BudgetPanel from './components/BudgetPanel.jsx';
import AuthGate from './components/AuthGate.jsx';
import AccountsPanel from './components/AccountsPanel.jsx';
import TrafficPanel from './components/TrafficPanel.jsx';
import QuestionsPanel from './components/QuestionsPanel.jsx';
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
import { useDocumentTitle } from './lib/useDocumentTitle.js';
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
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [activeTab, setActiveTab] = useState('roster');

  const isAdmin = account?.role === 'admin';

  useDocumentTitle('Admin');

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

  const handleQuickAddSave = async (data) => {
    await createParticipant(data, selectedTripId);
    setShowQuickAdd(false);
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

  const handleUpdatePayment = async (participant, field, value) => {
    await updateParticipant(participant.id, { [field]: value });
    await load();
  };

  const handleTripsChanged = async (preferredTripId) => {
    await loadTrips(preferredTripId);
  };

  const handleTripDetailsSaved = async () => {
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
  const tabLabel = {
    roster: 'Roster',
    budget: 'Budget',
    questions: 'Questions',
    'trip-details': 'Trip details',
    announcement: 'Announcement',
    accounts: 'Accounts',
    traffic: 'Traffic',
  }[activeTab] || 'Roster';

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <img className="app-logo" src={pantherLogo} alt="" />
          <div>
            <h1>{selectedTrip ? selectedTrip.name : 'Florida Trip'}</h1>
            <p className="subtitle">{tabLabel}</p>
          </div>
        </div>
        <div className="header-actions">
          <Link className="btn btn--ghost" to="/">
            Home page
          </Link>
          <Link className="btn btn--ghost" to="/register">
            Registration form
          </Link>
          {activeTab === 'roster' && (
            <>
              <button className="btn btn--ghost" onClick={() => setShowImport(true)}>
                Bulk import
              </button>
              <a className="btn btn--ghost" href={exportUrl(selectedTripId)} download>
                Export CSV
              </a>
              <div className="popover-anchor">
                <button className="btn btn--ghost" onClick={() => setShowQuickAdd((v) => !v)}>
                  Quick add
                </button>
                {showQuickAdd && (
                  <ParticipantForm
                    variant="popover"
                    participant={null}
                    onSave={handleQuickAddSave}
                    onCancel={() => setShowQuickAdd(false)}
                  />
                )}
              </div>
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

      <OverviewPanel stats={stats} trip={selectedTrip} />

      {selectedTrip && (
        <div className="segmented segmented--tabs">
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
          <button
            type="button"
            className={`segmented-btn ${activeTab === 'questions' ? 'segmented-btn--active' : ''}`}
            onClick={() => setActiveTab('questions')}
          >
            Questions
          </button>
          <button
            type="button"
            className={`segmented-btn ${activeTab === 'trip-details' ? 'segmented-btn--active' : ''}`}
            onClick={() => setActiveTab('trip-details')}
          >
            Trip details
          </button>
          <button
            type="button"
            className={`segmented-btn ${activeTab === 'announcement' ? 'segmented-btn--active' : ''}`}
            onClick={() => setActiveTab('announcement')}
          >
            Announcement
          </button>
          <button
            type="button"
            className={`segmented-btn ${activeTab === 'accounts' ? 'segmented-btn--active' : ''}`}
            onClick={() => setActiveTab('accounts')}
          >
            Accounts
          </button>
          <button
            type="button"
            className={`segmented-btn ${activeTab === 'traffic' ? 'segmented-btn--active' : ''}`}
            onClick={() => setActiveTab('traffic')}
          >
            Traffic
          </button>
        </div>
      )}

      {error && <div className="banner banner--error">{error}</div>}

      {activeTab === 'budget' && selectedTrip ? (
        <BudgetPanel tripId={selectedTrip.id} />
      ) : activeTab === 'questions' && selectedTrip ? (
        <QuestionsPanel tripId={selectedTrip.id} tripName={selectedTrip.name} />
      ) : activeTab === 'trip-details' && selectedTrip ? (
        <TripDetailsForm trip={selectedTrip} onSaved={handleTripDetailsSaved} />
      ) : activeTab === 'announcement' && selectedTrip ? (
        <AnnouncementPanel trip={selectedTrip} />
      ) : activeTab === 'accounts' ? (
        <AccountsPanel currentAccountId={account.id} />
      ) : activeTab === 'traffic' ? (
        <TrafficPanel />
      ) : loading && !participants.length ? (
        <p className="hint">Loading roster…</p>
      ) : (
        <RosterTable
          participants={participants}
          filters={filters}
          onFiltersChange={setFilters}
          onEdit={setEditing}
          onDelete={handleToggleActive}
          onUpdatePayment={handleUpdatePayment}
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

    </div>
  );
}
