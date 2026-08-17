import { useCallback, useEffect, useState } from 'react';
import { fetchParticipants } from '../api/participants.js';
import { fmtMoney } from '../lib/money.js';
import {
  fetchBudget,
  fetchBudgetCategories,
  fetchBudgetTrend,
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
  fetchBudgetDailyItems,
  addBudgetDailyItem,
  updateBudgetDailyItem,
  deleteBudgetDailyItem,
  autoCreateBudgetDailyItems,
} from '../api/budget.js';

/** Admin-only per-trip line-item budget, replicating the committee's Excel
 * "Budget" tab inside the app. Lives entirely off the live roster count
 * (minus per-category opt-outs) so Total Per Panther never drifts from the
 * real roster the way the hand-typed spreadsheet divisor did. Rendered as its
 * own tab in AdminRoster, alongside the Roster tab — not a modal. */

// The field each row type stores its value in — drafts/blur/input all need
// to key off the same three-way branch. 'food_planner' has no directly
// editable value (its total is the live sum of day-by-day entries), so it
// falls through to item.total same as 'totals', but that value is never
// rendered in an editable input for this type — see the Total/Rate cell.
function valueField(item) {
  if (item.type === 'per_swimmer') return item.rate_per_athlete;
  if (item.type === 'service_charge') return item.percent_rate;
  return item.total;
}

function dailyRowToDraft(row) {
  return {
    budget: String(row.budget),
    cash: String(row.cash),
    meals_covered: row.meals_covered ?? '',
    notes: row.notes ?? '',
  };
}

const EMPTY_DAILY_DRAFT = { date: '', budget: '', cash: '', meals_covered: '', notes: '' };

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
  const [showTrend, setShowTrend] = useState(false);
  const [trend, setTrend] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [expandedPlanners, setExpandedPlanners] = useState(new Set());
  const [dailyItems, setDailyItems] = useState({});
  const [dailyEditDrafts, setDailyEditDrafts] = useState({});
  const [newDailyDrafts, setNewDailyDrafts] = useState({});
  const [autoCreatingDays, setAutoCreatingDays] = useState(null);

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

  const loadDailyItems = async (tripBudgetItemId) => {
    try {
      const rows = await fetchBudgetDailyItems(tripBudgetItemId);
      setDailyItems((d) => ({ ...d, [tripBudgetItemId]: rows }));
      setDailyEditDrafts((d) => ({
        ...d,
        ...Object.fromEntries(rows.map((row) => [row.id, dailyRowToDraft(row)])),
      }));
    } catch {
      setError('Could not load that row’s day-by-day entries.');
    }
  };

  // Toggles the day-by-day sub-table for a 'food_planner' row — lazily
  // fetched on first expand, same "Manage X" toggle pattern as
  // showMatrix/showCategoryManager below.
  const handleTogglePlanner = async (item) => {
    const id = item.trip_budget_item_id;
    const alreadyExpanded = expandedPlanners.has(id);
    setExpandedPlanners((prev) => {
      const next = new Set(prev);
      if (alreadyExpanded) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!alreadyExpanded && !dailyItems[id]) {
      await loadDailyItems(id);
    }
  };

  const handleAddDailyItem = async (item) => {
    const id = item.trip_budget_item_id;
    const draft = newDailyDrafts[id] ?? EMPTY_DAILY_DRAFT;
    if (!draft.date) return;
    setError(null);
    try {
      await addBudgetDailyItem(id, {
        date: draft.date,
        budget: Number(draft.budget) || 0,
        cash: Number(draft.cash) || 0,
        meals_covered: draft.meals_covered,
        notes: draft.notes,
      });
      setNewDailyDrafts((d) => ({ ...d, [id]: EMPTY_DAILY_DRAFT }));
      await loadDailyItems(id);
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not add that day.');
    }
  };

  const handleDailyItemBlur = async (item, row) => {
    const draft = dailyEditDrafts[row.id];
    if (!draft) return;
    const budget = Number(draft.budget);
    const cash = Number(draft.cash);
    const invalid = draft.budget === '' || Number.isNaN(budget) || budget < 0 || draft.cash === '' || Number.isNaN(cash) || cash < 0;
    if (invalid) {
      setDailyEditDrafts((d) => ({ ...d, [row.id]: dailyRowToDraft(row) }));
      return;
    }
    const unchanged =
      budget === row.budget &&
      cash === row.cash &&
      draft.meals_covered === (row.meals_covered ?? '') &&
      draft.notes === (row.notes ?? '');
    if (unchanged) return;
    try {
      await updateBudgetDailyItem(item.trip_budget_item_id, row.id, {
        budget,
        cash,
        meals_covered: draft.meals_covered,
        notes: draft.notes,
      });
      await loadDailyItems(item.trip_budget_item_id);
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not save that day.');
    }
  };

  const handleAutoCreateDailyItems = async (item) => {
    const id = item.trip_budget_item_id;
    setAutoCreatingDays(id);
    setError(null);
    try {
      await autoCreateBudgetDailyItems(id);
      await loadDailyItems(id);
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not auto-create days for this trip.');
    } finally {
      setAutoCreatingDays(null);
    }
  };

  const handleDeleteDailyItem = async (item, row) => {
    setError(null);
    try {
      await deleteBudgetDailyItem(item.trip_budget_item_id, row.id);
      await loadDailyItems(item.trip_budget_item_id);
      await load();
    } catch (err) {
      setError(err.body?.error || 'Could not remove that day.');
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

  // Lazily fetches the multi-year trend the first time it's expanded, same
  // "Manage X" toggle pattern as showMatrix/showCategoryManager above — it
  // spans every trip year at once so there's no reason to reload it on
  // every load() call for the currently-viewed trip.
  const handleToggleTrend = async () => {
    const next = !showTrend;
    setShowTrend(next);
    if (next && !trend) {
      setTrendLoading(true);
      setError(null);
      try {
        setTrend(await fetchBudgetTrend());
      } catch {
        setError('Could not load the multi-year trend.');
      } finally {
        setTrendLoading(false);
      }
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
                      <option value="food_planner">Day-by-day planner</option>
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
                    {item.type === 'food_planner' ? (
                      <>
                        <strong>{fmtMoney(item.total)}</strong>{' '}
                        <button type="button" className="link-btn" onClick={() => handleTogglePlanner(item)}>
                          {expandedPlanners.has(item.trip_budget_item_id) ? 'Hide days' : 'Manage days'}
                        </button>
                      </>
                    ) : (
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
                    )}
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
              {items
                .filter((item) => item.type === 'food_planner' && expandedPlanners.has(item.trip_budget_item_id))
                .map((item) => (
                  <tr key={`${item.category_id}-daily`}>
                    <td colSpan={8}>
                      <div className="preview-table-wrap" style={{ margin: '0.4rem 0' }}>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          style={{ marginBottom: '0.4rem' }}
                          disabled={autoCreatingDays === item.trip_budget_item_id}
                          onClick={() => handleAutoCreateDailyItems(item)}
                        >
                          {autoCreatingDays === item.trip_budget_item_id
                            ? 'Adding days…'
                            : '+ Auto-create days for trip dates'}
                        </button>
                        <table className="preview-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Budget</th>
                              <th>Cash</th>
                              <th>Meals Covered</th>
                              <th>Additional Details</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(dailyItems[item.trip_budget_item_id] || []).map((row) => {
                              const draft = dailyEditDrafts[row.id] ?? dailyRowToDraft(row);
                              return (
                                <tr key={row.id}>
                                  <td>{row.date}</td>
                                  <td>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={draft.budget}
                                      onChange={(e) =>
                                        setDailyEditDrafts((d) => ({
                                          ...d,
                                          [row.id]: { ...draft, budget: e.target.value },
                                        }))
                                      }
                                      onBlur={() => handleDailyItemBlur(item, row)}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={draft.cash}
                                      onChange={(e) =>
                                        setDailyEditDrafts((d) => ({
                                          ...d,
                                          [row.id]: { ...draft, cash: e.target.value },
                                        }))
                                      }
                                      onBlur={() => handleDailyItemBlur(item, row)}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="text"
                                      value={draft.meals_covered}
                                      onChange={(e) =>
                                        setDailyEditDrafts((d) => ({
                                          ...d,
                                          [row.id]: { ...draft, meals_covered: e.target.value },
                                        }))
                                      }
                                      onBlur={() => handleDailyItemBlur(item, row)}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="text"
                                      value={draft.notes}
                                      onChange={(e) =>
                                        setDailyEditDrafts((d) => ({
                                          ...d,
                                          [row.id]: { ...draft, notes: e.target.value },
                                        }))
                                      }
                                      onBlur={() => handleDailyItemBlur(item, row)}
                                    />
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className="link-btn link-btn--danger"
                                      onClick={() => handleDeleteDailyItem(item, row)}
                                    >
                                      Remove
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                            <tr>
                              <td>
                                <input
                                  type="date"
                                  value={newDailyDrafts[item.trip_budget_item_id]?.date ?? ''}
                                  onChange={(e) =>
                                    setNewDailyDrafts((d) => ({
                                      ...d,
                                      [item.trip_budget_item_id]: {
                                        ...(d[item.trip_budget_item_id] ?? EMPTY_DAILY_DRAFT),
                                        date: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="$ budget"
                                  value={newDailyDrafts[item.trip_budget_item_id]?.budget ?? ''}
                                  onChange={(e) =>
                                    setNewDailyDrafts((d) => ({
                                      ...d,
                                      [item.trip_budget_item_id]: {
                                        ...(d[item.trip_budget_item_id] ?? EMPTY_DAILY_DRAFT),
                                        budget: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="$ cash"
                                  value={newDailyDrafts[item.trip_budget_item_id]?.cash ?? ''}
                                  onChange={(e) =>
                                    setNewDailyDrafts((d) => ({
                                      ...d,
                                      [item.trip_budget_item_id]: {
                                        ...(d[item.trip_budget_item_id] ?? EMPTY_DAILY_DRAFT),
                                        cash: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  placeholder="e.g. Lunch & Dinner"
                                  value={newDailyDrafts[item.trip_budget_item_id]?.meals_covered ?? ''}
                                  onChange={(e) =>
                                    setNewDailyDrafts((d) => ({
                                      ...d,
                                      [item.trip_budget_item_id]: {
                                        ...(d[item.trip_budget_item_id] ?? EMPTY_DAILY_DRAFT),
                                        meals_covered: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  placeholder="Details"
                                  value={newDailyDrafts[item.trip_budget_item_id]?.notes ?? ''}
                                  onChange={(e) =>
                                    setNewDailyDrafts((d) => ({
                                      ...d,
                                      [item.trip_budget_item_id]: {
                                        ...(d[item.trip_budget_item_id] ?? EMPTY_DAILY_DRAFT),
                                        notes: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </td>
                              <td>
                                <button type="button" className="btn btn--ghost" onClick={() => handleAddDailyItem(item)}>
                                  + Add day
                                </button>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
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
          {' · '}
          <button type="button" className="link-btn" onClick={handleToggleTrend}>
            {showTrend ? 'Hide' : 'Show'} multi-year trend
          </button>

          {showTrend && (
            <div className="preview-table-wrap" style={{ marginTop: '0.6rem' }}>
              {trendLoading ? (
                <p className="hint">Loading…</p>
              ) : (
                trend && (
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        {trend.trips.map((t) => (
                          <th key={t.trip_id}>{t.year}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trend.categories.map((c) => (
                        <tr key={c.category_id}>
                          <td>{c.category}</td>
                          {c.values.map((value, i) => (
                            <td key={trend.trips[i].trip_id}>{fmtMoney(value)}</td>
                          ))}
                        </tr>
                      ))}
                      <tr>
                        <td>
                          <strong>Total/Panther</strong>
                        </td>
                        {trend.grand_total_per_panther.map((value, i) => (
                          <td key={trend.trips[i].trip_id}>
                            <strong>{fmtMoney(value)}</strong>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                )
              )}
            </div>
          )}

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
