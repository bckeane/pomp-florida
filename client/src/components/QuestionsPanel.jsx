import { useEffect, useMemo, useState } from 'react';
import { answerFaqQuestion, fetchAdminQuestions } from '../api/questions.js';

function formatQuestionDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function QuestionsPanel({ tripId, tripName }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [notice, setNotice] = useState(null);

  const load = async () => {
    if (!tripId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchAdminQuestions(tripId);
      setQuestions(list);
      setDrafts(Object.fromEntries(list.map((question) => [question.id, question.answer ?? ''])));
    } catch {
      setError('Could not load questions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tripId]);

  const pendingCount = useMemo(
    () => questions.filter((question) => !question.answer).length,
    [questions]
  );

  const handleSave = async (question) => {
    const answer = (drafts[question.id] || '').trim();
    if (!answer) return;
    setSavingId(question.id);
    setNotice(null);
    try {
      await answerFaqQuestion(question.id, answer);
      setNotice(`Saved answer for "${question.question}".`);
      await load();
    } catch {
      setError('Could not save the answer.');
    } finally {
      setSavingId(null);
    }
  };

  if (!tripId) {
    return <div className="form-card"><p className="hint">Select a trip first.</p></div>;
  }

  return (
    <section className="form-card questions-panel">
      <div className="questions-panel__header">
        <div>
          <h2>Questions</h2>
          <p className="hint">Review new questions for {tripName || 'the selected trip'} and add answers.</p>
        </div>
        <div className="questions-panel__stats">
          <span className="questions-panel__count">{questions.length} total</span>
          <span className="questions-panel__count questions-panel__count--pending">{pendingCount} pending</span>
        </div>
      </div>

      {error && <div className="banner banner--error">{error}</div>}
      {notice && <div className="form-notice--ok">{notice}</div>}

      {loading ? (
        <p className="hint">Loading questions…</p>
      ) : questions.length === 0 ? (
        <p className="hint">No questions yet.</p>
      ) : (
        <div className="question-list">
          {questions.map((question) => {
            const answer = drafts[question.id] ?? '';
            return (
              <article key={question.id} className="question-card">
                <div className="question-card__top">
                  <span className={`question-pill ${question.answer ? 'question-pill--answered' : 'question-pill--pending'}`}>
                    {question.answer ? 'answered' : 'pending'}
                  </span>
                  <span className="question-card__date">{formatQuestionDate(question.created_at)}</span>
                </div>

                <p className="question-card__question">{question.question}</p>
                {question.asker_name && <p className="question-card__asker">Asked by {question.asker_name}</p>}

                <div className="question-card__answer">
                  <label>
                    Answer
                    <textarea
                      rows="4"
                      value={answer}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [question.id]: e.target.value }))}
                      placeholder="Type the answer that will appear on the FAQ page..."
                    />
                  </label>
                </div>

                <div className="modal-actions question-card__actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={savingId === question.id || !answer.trim()}
                    onClick={() => handleSave(question)}
                  >
                    {savingId === question.id ? 'Saving…' : 'Save answer'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
