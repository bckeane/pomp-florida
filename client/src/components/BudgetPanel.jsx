import { useCallback, useEffect, useState } from 'react';
import { fetchParticipants } from '../api/participants.js';
import { fmtMoney } from '../lib/money.js';
import {
  fetchBudget,
  fetchBudgetCategories,
  createBudgetCategory,
  retireBudgetCategory,
  unretireBudgetCategory,
  attachBudgetCategory,
  detachBudgetCategory,
  updateBudgetLineItem,
  switchBudgetItemType,
  setBudgetStudentCountOverride,
  setBudgetExclusion,
  clearBudgetExclusion,
} from '../api/budget.js';

/** Admin-only per-trip line-item budget, replicating the committee's Excel
 * "Budget" tab inside the app. Lives entirely off the live roster count
 * (minus per-category opt-outs) so Total Per Panther never drifts from the
 * real roster the way the hand-typed spreadsheet divisor did. Rendered as its
 * own tab in AdminRoster, alongside the Roster tab — not a modal. */

// The field each row type stores its value in — drafts/blur/input all need
// to key off the same three-way branch.
function valueField(item) {
  if (item.type === 'per_swimmer') return item.rate_per_athlete;
  if (item.type === 'service_charge') return item.percent_rate;
  return item.total;
}

export default function BudgetPanel({ tripId }) {
  const [items, setItems] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [studentDrafts, setStudentDrafts] = useState({});
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [existingCategoryId, setExistingCategoryId] = useState('');
  const [addingExisting, setAddingExisting] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [budgetItems, categories, roster] = await Promise.all([
        fetchBudget(tripId),
        fetchBudgetCategories(),
        fetchParticipants({ trip_id: tripId, active: '1' }),
      ]);
      setItems(budgetItems);
      setAllCategories(categories);
      setStudents(
        roster
          .filter((p) => p.role === 'Swimmer' || p.role === 'Diver')
          .sort((a, b) => a.last_name.localeCompare(b.last_name))
      );
      setDrafts(
        Object.fromEntries(
          budgetItems.map((i) => {
            const value = valueField(i);
            return [i.category_id, value == null ? '' : String(value)];
          })
        )
      );
      setStudentDrafts(Object.fromEntries(budgetItems.map((i) => [i.category_id, String(i.students)])));
    } catch {
      setError('Could not load the budget. Is the API running?');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleValueBlur = async (item) => {
    const raw = drafts[item.category_id];
    const value = Number(raw);
    const currentValue = valueField(item);
    if (raw === '' || Number.isNaN(value) || value < 0) {
      setDrafts((d) => ({ ...d, [item.category_id]: currentValue == null ? '' : String(currentValue) }));
      return;
    }
    if (value === currentValue) return;
    try {
      const payload =
        item.type === 'per_swimmer'
          ? { rate_per_athlete: value }
          : item.type === 'service_charge'
            ? { percent_rate: value }
            : { total: value };
      await updateBudgetLineItem(tripId, item.category_id, payload);
      await load();
    } catch {
      setError('Could not save that value.');
    }
  };

  // Pins this row's # Students to a manual figure, overriding the live
  // roster count minus this item's own exclusions — for a category whose
  // real headcount doesn't match the roster closely enough for exclusions
  // alone to express (e.g. a vendor-agreed count).
  const handleStudentCountBlur = async (item) => {
    const raw = studentDrafts[item.category_id];
    const value = Number(raw);
    const currentValue = item.students;
    if (raw === '' || !Number.isInteger(value) || value < 0) {
      setStudentDrafts((d) => ({ ...d, [item.category_id]: String(currentValue) }));
      return;
    }
    if (value === currentValue) return;
    try {
      await setBudgetStudentCountOverride(item.trip_budget_item_id, value);
      await load();
    } catch {
      setError('Could not save that student count.');
    }
  };

  const handleResetStudentCount = async (item) => {
    setError(null);
    try {
      await setBudgetStudentCountOverride(item.trip_budget_item_id, null);
      await load();
    } catch {
      setError('Could not reset that student count.');
    }
  };

  const handleTypeSwitch = async (item, type) => {
    setError(null);
    try {
      await switchBudgetItemType(item.trip_budget_item_id, type);
      await load();
    } catch (err) {
      setError(err.body?.error || "Could not change that row's type.");
    }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setAddingCategory(true);
    setError(null);
    try {
      const category = await createBudgetCategory(name);
      await attachBudgetCategory(tripId, category.id);
      setNewCategoryName('');
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not add that category.');
    } finally {
      setAddingCategory(false);
    }
  };

  // For a trip that predates this feature (or any trip missing a category
  // other trips already use), the category already exists globally — trying
  // to "add" it by name would 400 as a duplicate. This attaches the existing
  // category to this trip directly instead.
  const handleAddExisting = async () => {
    if (!existingCategoryId) return;
    setAddingExisting(true);
    setError(null);
    try {
      await attachBudgetCategory(tripId, Number(existingCategoryId));
      setExistingCategoryId('');
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not add that category.');
    } finally {
      setAddingExisting(false);
    }
  };

  // A trip that predates this feature entirely is missing every category at
  // once — clicking "add existing" one at a time for all 7 is exactly the
  // friction this is for.
  const handleAddAllMissing = async (missing) => {
    setAddingExisting(true);
    setError(null);
    try {
      for (const c of missing) {
        await attachBudgetCategory(tripId, c.id);
      }
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not add those categories.');
    } finally {
      setAddingExisting(false);
    }
  };

  // Detaches this category from just the trip being viewed — the server
  // rejects it with a clear message if the row still has a nonzero
  // total/rate, since that's real budget data, not clutter.
  const handleRemoveFromTrip = async (item) => {
    setError(null);
    try {
      await detachBudgetCategory(tripId, item.category_id);
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not remove that category from this trip.');
    }
  };

  const handleRetireCategory = async (category) => {
    setError(null);
    try {
      await retireBudgetCategory(category.id);
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not retire that category.');
    }
  };

  const handleUnretireCategory = async (category) => {
    setError(null);
    try {
      await unretireBudgetCategory(category.id);
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not restore that category.');
    }
  };

  const handleToggleExclusion = async (item, participantId, isExcluded) => {
    setError(null);
    try {
      if (isExcluded) {
        await clearBudgetExclusion(item.trip_budget_item_id, participantId);
      } else {
        await setBudgetExclusion(item.trip_budget_item_id, participantId);
      }
      await load();
    } catch {
      setError('Could not update that exclusion.');
    }
  };

  const attachedCategoryIds = new Set(items.map((i) => i.category_id));
  const missingCategories = allCategories.filter(
    (c) => !c.retired && !attachedCategoryIds.has(c.id)
  );

  const totals = items.reduce(
    (acc, item) => ({
      total: acc.total + item.total,
      perPanther: acc.perPanther + (item.total_per_panther ?? 0),
      diff: acc.diff + (item.diff ?? 0),
    }),
    { total: 0, perPanther: 0, diff: 0 }
  );

  return (
    <div className="budget-tab">
      <p className="hint">
        Totals per family are computed from the live roster, minus anyone opted out of a category
        below. The # Students column can be edited directly to override that count for a single
        category — click Auto to go back to the live roster count.
      </p>

      {error && <div className="form-error form-error--root">{error}</div>}

      {loading ? (
        <p className="hint">Loading…</p>
      ) : (
        <>
          <table className="roster-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Type</th>
                <th>Total / Rate</th>
                <th># Students</th>
                <th>Total/Panther</th>
                <th>Diff vs prior yr</th>
                <th>Prior yr/Panther</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.category_id}>
                  <td data-label="Category">{item.category}</td>
                  <td data-label="Type">
                    <select
                      value={item.type}
                      onChange={(e) => handleTypeSwitch(item, e.target.value)}
                    >
                      <option value="totals">Totals</option>
                      <option value="per_swimmer">Per swimmer/diver</option>
                      <option value="service_charge">Service charge (%)</option>
                    </select>
                  </td>
                  <td
                    data-label={
                      item.type === 'per_swimmer'
                        ? 'Rate/athlete'
                        : item.type === 'service_charge'
                          ? 'Rate %'
                          : 'Total'
                    }
                  >
                    <input
                      type="number"
                      min="0"
                      step={item.type === 'service_charge' ? '0.1' : '1'}
                      value={drafts[item.category_id] ?? ''}
                      placeholder={
                        item.type === 'per_swimmer'
                          ? '$/athlete'
                          : item.type === 'service_charge'
                            ? '% of total'
                            : '$ total'
                      }
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [item.category_id]: e.target.value }))
                      }
                      onBlur={() => handleValueBlur(item)}
                    />
                  </td>
                  <td data-label="# Students">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={studentDrafts[item.category_id] ?? ''}
                      title={item.student_count_override != null ? 'Overridden — click Auto to use the live roster count again' : 'Live roster count minus opt-outs — edit to override'}
                      onChange={(e) =>
                        setStudentDrafts((d) => ({ ...d, [item.category_id]: e.target.value }))
                      }
                      onBlur={() => handleStudentCountBlur(item)}
                    />
                    {item.student_count_override != null && (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => handleResetStudentCount(item)}
                      >
                        Auto
                      </button>
                    )}
                  </td>
                  <td data-label="Total/Panther">{fmtMoney(item.total_per_panther)}</td>
                  <td data-label="Diff vs prior yr">{fmtMoney(item.diff)}</td>
                  <td data-label="Prior yr/Panther">{fmtMoney(item.prior_total_per_panther)}</td>
                  <td data-label="">
                    <button
                      type="button"
                      className="link-btn link-btn--danger"
                      onClick={() => handleRemoveFromTrip(item)}
                    >
                      Remove from trip
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td data-label="Category">
                  <strong>Total</strong>
                </td>
                <td data-label="Type"></td>
                <td data-label="Total">
                  <strong>{fmtMoney(totals.total)}</strong>
                </td>
                <td data-label="# Students"></td>
                <td data-label="Total/Panther">
                  <strong>{fmtMoney(totals.perPanther)}</strong>
                </td>
                <td data-label="Diff vs prior yr">
                  <strong>{fmtMoney(totals.diff)}</strong>
                </td>
                <td data-label="Prior yr/Panther"></td>
                <td data-label=""></td>
              </tr>
            </tbody>
          </table>

          {missingCategories.length > 0 && (
            <div className="form-row" style={{ marginTop: '0.8rem' }}>
              <label>
                Add existing category
                <select
                  value={existingCategoryId}
                  onChange={(e) => setExistingCategoryId(e.target.value)}
                >
                  <option value="">Choose a category…</option>
                  {missingCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={handleAddExisting}
                disabled={addingExisting || !existingCategoryId}
              >
                + Add to this trip
              </button>
              {missingCategories.length > 1 && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => handleAddAllMissing(missingCategories)}
                  disabled={addingExisting}
                >
                  + Add all {missingCategories.length}
                </button>
              )}
            </div>
          )}

          <div className="form-row" style={{ marginTop: '0.8rem' }}>
            <label>
              New category name
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Overrun"
              />
            </label>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleAddCategory}
              disabled={addingCategory || !newCategoryName.trim()}
            >
              + Add category
            </button>
          </div>

          <button type="button" className="link-btn" onClick={() => setShowMatrix((v) => !v)}>
            {showMatrix ? 'Hide' : 'Manage'} per-student opt-outs
          </button>
          {' · '}
          <button
            type="button"
            className="link-btn"
            onClick={() => setShowCategoryManager((v) => !v)}
          >
            {showCategoryManager ? 'Hide' : 'Manage'} categories
          </button>

          {showCategoryManager && (
            <div className="preview-table-wrap" style={{ marginTop: '0.6rem' }}>
              <p className="hint">
                Retiring a category here stops it being auto-added to future trip years and
                hides it from the "add existing category" picker above. It never touches any
                trip's existing line items — use "Remove from trip" on a zero-value row above
                for that.
              </p>
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {allCategories.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.retired ? 'Retired' : 'Active'}</td>
                      <td>
                        {c.retired ? (
                          <button type="button" className="link-btn" onClick={() => handleUnretireCategory(c)}>
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="link-btn link-btn--danger"
                            onClick={() => handleRetireCategory(c)}
                          >
                            Retire
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showMatrix && (
            <div className="preview-table-wrap" style={{ marginTop: '0.6rem' }}>
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    {items.map((item) => (
                      <th key={item.category_id}>{item.category}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id}>
                      <td>
                        {student.last_name}, {student.first_name}
                      </td>
                      {items.map((item) => {
                        const isExcluded = item.excluded_participant_ids.includes(student.id);
                        return (
                          <td key={item.category_id} style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={!isExcluded}
                              onChange={() => handleToggleExclusion(item, student.id, isExcluded)}
                              title={isExcluded ? 'Excluded — click to include' : 'Included — click to exclude'}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
