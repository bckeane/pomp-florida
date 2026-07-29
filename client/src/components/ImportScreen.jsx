import { useState } from 'react';
import { parseCSV } from '../lib/csv.js';
import { mapRow, previewValidate } from '../lib/importPreview.js';
import { importParticipants } from '../api/participants.js';

export default function ImportScreen({ tripId, tripYear, onClose, onImported }) {
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const buildPreview = (text) => {
    setCsvText(text);
    if (!text.trim()) {
      setPreview(null);
      return;
    }
    const rows = parseCSV(text).map((raw) => {
      const mapped = mapRow(raw);
      const errors = previewValidate(mapped, tripYear);
      return { raw, mapped, errors };
    });
    setPreview(rows);
    setResult(null);
  };

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => buildPreview(String(reader.result));
    reader.readAsText(file);
  };

  const handleConfirm = async (partial) => {
    setImporting(true);
    try {
      const res = await importParticipants(csvText, { partial, tripId });
      setResult(res);
      if (res.imported > 0) onImported();
    } catch (err) {
      setResult(err.body || { errors: [{ message: 'Import failed' }] });
    } finally {
      setImporting(false);
    }
  };

  const validCount = preview ? preview.filter((r) => r.errors.length === 0).length : 0;
  const invalidCount = preview ? preview.length - validCount : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel modal-panel--wide" onClick={(e) => e.stopPropagation()}>
        <h2>Bulk import roster</h2>
        <p className="hint">
          Paste CSV rows or drop a file. Expected headers: First Name, Last Name, Grad Year, Birth
          Date, Role. "Swim"/"Dive" are accepted as role aliases. A "Grade 2026" column is fine to
          include but is ignored — grade is always calculated from grad year.
        </p>

        <div
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
        >
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <span>or drop a .csv file here</span>
        </div>

        <textarea
          className="csv-textarea"
          placeholder="First Name,Last Name,Grad Year,Birth Date,Role"
          value={csvText}
          onChange={(e) => buildPreview(e.target.value)}
          rows={8}
        />

        {preview && (
          <>
            <div className="preview-summary">
              <span className="badge badge--ok">{validCount} valid</span>
              <span className="badge badge--bad">{invalidCount} with errors</span>
            </div>

            <div className="preview-table-wrap">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>First</th>
                    <th>Last</th>
                    <th>Role</th>
                    <th>Grad year</th>
                    <th>Birth date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className={r.errors.length ? 'row--error' : ''}>
                      <td>{i + 1}</td>
                      <td>{r.mapped.first_name}</td>
                      <td>{r.mapped.last_name}</td>
                      <td>{r.mapped.role}</td>
                      <td>{r.mapped.grad_year}</td>
                      <td>{r.mapped.birth_date}</td>
                      <td>{r.errors.length ? r.errors.join('; ') : 'OK'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {result && (
          <div className="import-result">
            <p>
              Imported {result.imported ?? 0}, skipped {result.skipped ?? 0}.
            </p>
            {result.errors?.length > 0 && (
              <ul className="error-list">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row ?? '—'} [{e.field}]: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
          {preview && (
            <>
              <button
                className="btn btn--ghost"
                disabled={importing || invalidCount === 0}
                onClick={() => handleConfirm(true)}
                title="Import only the valid rows, skip the rest"
              >
                Import valid rows only
              </button>
              <button className="btn btn--primary" disabled={importing || !preview.length} onClick={() => handleConfirm(false)}>
                {importing ? 'Importing…' : `Import all ${preview.length} rows`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
