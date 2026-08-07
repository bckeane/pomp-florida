import { useCallback, useEffect, useState } from 'react';
import { fetchParticipants } from '../api/participants.js';
import { fmtMoney } from '../lib/money.js';
import {
  fetchBudget,
  fetchBudgetCategories,
  createBudgetCategory,
  retireBudgetCategory,
  attachBudgetCategory,
  updateBudgetLineItem,
  switchBudgetItemType,
  setBudgetExclusion,
  clearBudgetExclusion,
} from '../api/budget.js';

/** Admin-only per-trip line-item budget, replicating the committee's Excel
 * "Budget" tab inside the app. Lives entirely off the live roster count
 * (minus per-category opt-outs) so Total Per Panther never drifts from the
 * real roster the way the hand-typed spreadsheet divisor did. Rendered as its
 * own tab in AdminRoster, alongside the Roster tab — not a modal. */
export default function BudgetPanel({ tripId }) {
  const [items, setItems] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [existingCategoryId, setExistingCategoryId] = useState('');
  const [addingExisting, setAddingExisting] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);

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
          budgetItems.map((i) => [
            i.category_id,
            i.type === 'per_swimmer' ? (i.rate_per_athlete == null ? '' : String(i.rate_per_athlete)) : String(i.total),
          ])
        )
      );
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
    const currentValue = item.type === 'per_swimmer' ? item.rate_per_athlete : item.total;
    if (raw === '' || Number.isNaN(value) || value < 0) {
      setDrafts((d) => ({ ...d, [item.category_id]: currentValue == null ? '' : String(currentValue) }));
      return;
    }
    if (value === currentValue) return;
    try {
      const payload = item.type === 'per_swimmer' ? { rate_per_athlete: value } : { total: value };
      await updateBudgetLineItem(tripId, item.category_id, payload);
      await load();
    } catch {
      setError('Could not save that value.');
    }
  };

  const handleTypeSwitch = async (item, type) => {
    setError(null);
    try {
      await switchBudgetItemType(item.trip_budget_item_id, type);
      await load();
    } catch {
      setError("Could not change that row's type.");
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

  const handleRetire = async (item) => {
    setError(null);
    try {
      await retireBudgetCategory(item.category_id);
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not retire that category.');
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
        below.
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
                    </select>
                  </td>
                  <td data-label={item.type === 'per_swimmer' ? 'Rate/athlete' : 'Total'}>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={drafts[item.category_id] ?? ''}
                      placeholder={item.type === 'per_swimmer' ? '$/athlete' : '$ total'}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [item.category_id]: e.target.value }))
                      }
                      onBlur={() => handleValueBlur(item)}
                    />
                  </td>
                  <td data-label="# Students">{item.students}</td>
                  <td data-label="Total/Panther">{fmtMoney(item.total_per_panther)}</td>
                  <td data-label="Diff vs prior yr">{fmtMoney(item.diff)}</td>
                  <td data-label="Prior yr/Panther">{fmtMoney(item.prior_total_per_panther)}</td>
                  <td data-label="">
                    <button
                      type="button"
                      className="link-btn link-btn--danger"
                      onClick={() => handleRetire(item)}
                    >
                      Retire
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
