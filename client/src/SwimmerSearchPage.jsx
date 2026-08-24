import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { fetchAllRecords, fetchTop20 } from './api/records.js';
import { uniqueEvents } from './lib/eventList.js';
import { searchTop20Rows } from './lib/swimmerSearch.js';
import { aggregateSettled } from './lib/recordsAggregate.js';
import { useDocumentTitle } from './lib/useDocumentTitle.js';
import pantherLogo from './img/pomp_icon.png';
import './home.css';
import './records.css';

function highlightMatch(text, term) {
  if (!term) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) => (regex.test(part) ? <span key={i} className="records-highlight">{part}</span> : part));
}

const SORT_COMPARATORS = {
  event: (a, b) => a.eventName.localeCompare(b.eventName),
  gender: (a, b) => a.gender.localeCompare(b.gender),
  place: (a, b) => Number(a.place) - Number(b.place),
  year: (a, b) => Number(a.year) - Number(b.year),
  time: (a, b) => a.time.localeCompare(b.time),
  swimmer: (a, b) => (a.swimmers[0] || '').localeCompare(b.swimmers[0] || ''),
};

export default function SwimmerSearchPage() {
  useDocumentTitle('Swimmer Search');
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [queryInput, setQueryInput] = useState(query);

  const [status, setStatus] = useState(query ? 'loading' : 'idle');
  const [results, setResults] = useState([]);
  const [partial, setPartial] = useState({ somePartialFailure: false, failedCount: 0, total: 0 });

  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [filterEvent, setFilterEvent] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterPlace, setFilterPlace] = useState('');
  const [filterTime, setFilterTime] = useState('');
  const [filterSwimmer, setFilterSwimmer] = useState('');

  useEffect(() => {
    setQueryInput(query);

    if (!query) {
      setStatus('idle');
      setResults([]);
      return;
    }

    let cancelled = false;

    (async () => {
      setStatus('loading');
      try {
        const records = await fetchAllRecords();
        const events = uniqueEvents(records);

        const settled = await Promise.allSettled(events.map((event) => fetchTop20(event.id)));
        const agg = aggregateSettled(settled);

        if (cancelled) return;

        if (agg.allFailed) {
          setStatus('error');
          return;
        }

        const allResults = agg.fulfilled.flatMap((rows, i) => searchTop20Rows(rows, events[i], query));
        setResults(allResults);
        setPartial(agg);
        setStatus('success');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query]);

  const filteredResults = results.filter((r) => {
    if (filterEvent && r.eventName !== filterEvent) return false;
    if (filterGender && r.gender !== filterGender) return false;
    if (filterYear && String(r.year) !== filterYear) return false;
    if (filterPlace && !String(r.place).includes(filterPlace)) return false;
    if (filterTime && !r.time.toLowerCase().includes(filterTime.toLowerCase())) return false;
    if (filterSwimmer && !r.swimmers.some((s) => s.toLowerCase().includes(filterSwimmer.toLowerCase()))) return false;
    return true;
  });

  const sortedResults = [...filteredResults].sort((a, b) => {
    if (!sortColumn) return 0;
    const dir = sortDirection === 'asc' ? 1 : -1;
    return dir * SORT_COMPARATORS[sortColumn](a, b);
  });

  const uniqueFilterEvents = [...new Set(results.map((r) => r.eventName))].sort();
  const uniqueFilterGenders = [...new Set(results.map((r) => r.gender))].sort();
  const uniqueFilterYears = [...new Set(results.map((r) => String(r.year)))].sort((a, b) => b - a);
  const hasActiveFilters = filterEvent || filterGender || filterYear || filterPlace || filterTime || filterSwimmer;

  function clearFilters() {
    setFilterEvent('');
    setFilterGender('');
    setFilterYear('');
    setFilterPlace('');
    setFilterTime('');
    setFilterSwimmer('');
  }

  function handleSort(column) {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }

  function sortIndicator(column) {
    if (sortColumn !== column) return ' ↕';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = queryInput.trim();
    setSearchParams(trimmed ? { q: trimmed } : {});
  }

  return (
    <div className="home-page records-page">
      <header className="hero">
        <img className="hero-logo" src={pantherLogo} alt="Pomperaug Panthers" />
        <p className="eyebrow">Pomperaug Panthers Swim &amp; Dive</p>
        <h1 className="hero-title">Swimmer Search</h1>
      </header>

      <form className="records-search-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Search swimmers…"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          aria-label="Search swimmers"
        />
        <button type="submit">Search</button>
      </form>

      {status === 'idle' && <p className="records-empty">Enter a name above to search all-time results.</p>}

      {status === 'loading' && <p className="hint">Searching across all events…</p>}

      {status === 'error' && (
        <div className="banner banner--error">Search is temporarily unavailable.</div>
      )}

      {status === 'success' && query && results.length === 0 && (
        <p className="records-empty">No results for &quot;{query}&quot; — try a different name or spelling.</p>
      )}

      {status === 'success' && results.length > 0 && (
        <>
          {partial.somePartialFailure && (
            <div className="records-notice">
              Couldn&apos;t check {partial.failedCount} of {partial.total} events — results may be incomplete.
            </div>
          )}

          <p className="records-search-summary">
            Found <strong>{filteredResults.length}</strong> of {results.length} result
            {results.length !== 1 ? 's' : ''}
            {hasActiveFilters && (
              <button type="button" className="records-clear-filters" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </p>

          <div className="records-search-results">
            <table className="records-table">
              <thead>
                <tr>
                  <th className="records-sortable" onClick={() => handleSort('event')}>
                    Event{sortIndicator('event')}
                  </th>
                  <th className="records-sortable" onClick={() => handleSort('gender')}>
                    Gender{sortIndicator('gender')}
                  </th>
                  <th className="records-sortable records-col-place" onClick={() => handleSort('place')}>
                    Place{sortIndicator('place')}
                  </th>
                  <th className="records-sortable records-col-year" onClick={() => handleSort('year')}>
                    Year{sortIndicator('year')}
                  </th>
                  <th className="records-sortable records-col-time" onClick={() => handleSort('time')}>
                    Time{sortIndicator('time')}
                  </th>
                  <th className="records-sortable" onClick={() => handleSort('swimmer')}>
                    Swimmer(s){sortIndicator('swimmer')}
                  </th>
                </tr>
                <tr className="records-filter-row">
                  <th>
                    <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)}>
                      <option value="">All</option>
                      {uniqueFilterEvents.map((ev) => (
                        <option key={ev} value={ev}>
                          {ev}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th>
                    <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)}>
                      <option value="">All</option>
                      {uniqueFilterGenders.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th>
                    <input
                      type="text"
                      placeholder="Filter…"
                      value={filterPlace}
                      onChange={(e) => setFilterPlace(e.target.value)}
                    />
                  </th>
                  <th>
                    <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
                      <option value="">All</option>
                      {uniqueFilterYears.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th>
                    <input
                      type="text"
                      placeholder="Filter…"
                      value={filterTime}
                      onChange={(e) => setFilterTime(e.target.value)}
                    />
                  </th>
                  <th>
                    <input
                      type="text"
                      placeholder="Filter…"
                      value={filterSwimmer}
                      onChange={(e) => setFilterSwimmer(e.target.value)}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((r, idx) => (
                  <tr key={idx}>
                    <td>
                      <Link className="records-event-link" to={`/records/top20/${r.eventId}`}>
                        {r.eventName}
                      </Link>
                    </td>
                    <td>{r.gender}</td>
                    <td className="records-col-place">{r.place}</td>
                    <td className="records-col-year">{r.year}</td>
                    <td className="records-col-time">{r.time}</td>
                    <td>
                      <span className="records-swimmers">
                        {r.swimmers.map((name, i) => (
                          <span key={i}>{highlightMatch(name, query)}</span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Link className="records-back-link" to="/records">
        &larr; Back to Team Records
      </Link>
    </div>
  );
}
