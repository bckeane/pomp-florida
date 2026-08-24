import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fetchAllRecords, fetchTop20 } from './api/records.js';
import { uniqueEvents } from './lib/eventList.js';
import { aggregateSettled } from './lib/recordsAggregate.js';
import { useDocumentTitle } from './lib/useDocumentTitle.js';
import pantherLogo from './img/pomp_icon.png';
import './home.css';
import './records.css';

function buildEventRows(rows) {
  return rows.map((swim, index) => {
    const swimmers = [swim.Swimmer_Name, swim.Swimmer_Name2, swim.Swimmer_Name3, swim.Swimmer_Name4]
      .filter((name) => name && name.trim() !== '')
      .map((name) => name.trim());
    return {
      Place: index + 1,
      Year: swim.Event_Year,
      Time: swim.Time_Formatted,
      Swimmers: swimmers,
      isRelay: swimmers.length > 1,
    };
  });
}

function exportToExcel(selectedEventData, genderSuffix) {
  const workbook = XLSX.utils.book_new();

  for (const { label, eventData } of selectedEventData) {
    const sheetData = [['Event', 'Place', 'Year', 'Time', 'Swimmer 1', 'Swimmer 2', 'Swimmer 3', 'Swimmer 4']];
    for (const { eventName, data } of eventData) {
      for (const row of data) {
        sheetData.push([eventName, row.Place, row.Year, row.Time, ...row.Swimmers.slice(0, 4).concat(['', '', '', '']).slice(0, 4)]);
      }
    }
    if (sheetData.length > 1) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheetData), `${label} Top 25`);
    }
  }

  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `Swimming_Top25_${genderSuffix}_${date}.xlsx`);
}

function exportToPDF(selectedEventData, genderSuffix, logoDataUrl) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const date = new Date().toISOString().split('T')[0];
  const pageWidth = doc.internal.pageSize.getWidth();

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', (pageWidth - 40) / 2, 40, 40, 40);
  }
  doc.setFontSize(22);
  doc.setTextColor(0, 0, 0);
  doc.text('Pomperaug Swim and Dive', pageWidth / 2, 100, { align: 'center' });
  doc.text('Top Times', pageWidth / 2, 112, { align: 'center' });
  doc.setFontSize(12);
  doc.setTextColor(80, 80, 80);
  doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), pageWidth / 2, 128, {
    align: 'center',
  });

  for (const { label, eventData } of selectedEventData) {
    for (const { eventName, data } of eventData) {
      if (data.length === 0) continue;
      doc.addPage('a4', 'portrait');
      const isRelay = data.some((row) => row.isRelay);

      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text(`${label} - ${eventName}`, 20, 12);

      const head = isRelay
        ? [['Place', 'Time', 'Swimmer 1', 'Swimmer 2', 'Swimmer 3', 'Swimmer 4', 'Year']]
        : [['Place', 'Time', 'Swimmer(s)', 'Year']];
      const body = data.map((row) =>
        isRelay
          ? [row.Place, row.Time, row.Swimmers[0] || '', row.Swimmers[1] || '', row.Swimmers[2] || '', row.Swimmers[3] || '', row.Year]
          : [row.Place, row.Time, row.Swimmers.join(', '), row.Year]
      );

      autoTable(doc, {
        startY: 15,
        head,
        body,
        theme: 'grid',
        margin: { left: 12, right: 12, top: 15, bottom: 12 },
        headStyles: { fillColor: [152, 0, 0], fontSize: 8 },
        styles: { cellPadding: 1.5, fontSize: 7.5, overflow: 'ellipsize', valign: 'middle' },
      });
    }
  }

  doc.save(`Swimming_Top25_${genderSuffix}_${date}.pdf`);
}

async function toDataUrl(src) {
  const res = await fetch(src);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

export default function Top25ExportPage() {
  useDocumentTitle('Export Top 25');
  const [status, setStatus] = useState('loading');
  const [boysData, setBoysData] = useState([]);
  const [girlsData, setGirlsData] = useState([]);
  const [partial, setPartial] = useState({ somePartialFailure: false, failedCount: 0, total: 0 });

  const [exportBoys, setExportBoys] = useState(true);
  const [exportGirls, setExportGirls] = useState(false);
  const [exportFormat, setExportFormat] = useState('pdf');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const records = await fetchAllRecords();
        const events = uniqueEvents(records);

        const settled = await Promise.allSettled(
          events.map(async (event) => ({ event, rows: await fetchTop20(event.id) }))
        );
        const agg = aggregateSettled(settled);
        if (cancelled) return;

        if (agg.allFailed) {
          setStatus('error');
          return;
        }

        const boys = [];
        const girls = [];
        for (const { event, rows } of agg.fulfilled) {
          const data = buildEventRows(rows).slice(0, 25);
          const bucket = (event.gender || '').toLowerCase() === 'boys' ? boys : girls;
          bucket.push({ eventName: event.name, data });
        }

        setBoysData(boys);
        setGirlsData(girls);
        setPartial(agg);
        setStatus('success');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleExport() {
    const genderSuffix = exportBoys && exportGirls ? 'Both' : exportBoys ? 'Boys' : 'Girls';
    const selectedEventData = [
      ...(exportBoys ? [{ label: 'Boys', eventData: boysData }] : []),
      ...(exportGirls ? [{ label: 'Girls', eventData: girlsData }] : []),
    ];

    if (exportFormat === 'excel') {
      exportToExcel(selectedEventData, genderSuffix);
    } else {
      const logoDataUrl = await toDataUrl(pantherLogo).catch(() => null);
      exportToPDF(selectedEventData, genderSuffix, logoDataUrl);
    }
  }

  const hasData = boysData.length > 0 || girlsData.length > 0;

  return (
    <div className="home-page records-page">
      <header className="hero">
        <img className="hero-logo" src={pantherLogo} alt="Pomperaug Panthers" />
        <div className="hero-text">
          <p className="eyebrow">Pomperaug Panthers Swim &amp; Dive</p>
          <h1 className="hero-title">Export Top 25</h1>
          <p className="hero-intro">Export swimming records to Excel or PDF by gender</p>
        </div>
      </header>

      {status === 'loading' && <p className="hint">Loading top 25 data…</p>}

      {status === 'error' && <div className="banner banner--error">Export data is temporarily unavailable.</div>}

      {status === 'success' && (
        <>
          {partial.somePartialFailure && (
            <div className="records-notice">
              {partial.failedCount} of {partial.total} events could not be retrieved — the export will be missing
              that data.
            </div>
          )}

          <div className="records-export-form">
            <div className="records-export-field">
              <label>Select Gender(s) to Export</label>
              <div className="records-export-choices">
                <label>
                  <input type="checkbox" checked={exportBoys} onChange={(e) => setExportBoys(e.target.checked)} />
                  Boys
                </label>
                <label>
                  <input type="checkbox" checked={exportGirls} onChange={(e) => setExportGirls(e.target.checked)} />
                  Girls
                </label>
              </div>
            </div>

            <div className="records-export-field">
              <label>Export Format</label>
              <div className="records-export-choices">
                <label>
                  <input
                    type="radio"
                    name="format"
                    value="pdf"
                    checked={exportFormat === 'pdf'}
                    onChange={(e) => setExportFormat(e.target.value)}
                  />
                  PDF
                </label>
                <label>
                  <input
                    type="radio"
                    name="format"
                    value="excel"
                    checked={exportFormat === 'excel'}
                    onChange={(e) => setExportFormat(e.target.value)}
                  />
                  Excel
                </label>
              </div>
            </div>

            <button
              type="button"
              className="records-export-submit"
              disabled={(!exportBoys && !exportGirls) || !hasData}
              onClick={handleExport}
            >
              Export to {exportFormat === 'excel' ? 'Excel' : 'PDF'}
            </button>
          </div>

          {(exportBoys || exportGirls) && (
            <div className="records-preview">
              <h2 className="section-title records-preview-heading">Print Preview</h2>

              <div className="records-preview-title">
                <img src={pantherLogo} alt="Pomperaug Panthers" />
                <h3>Pomperaug Swim and Dive</h3>
                <h3>Top Times</h3>
                <p>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>

              {[
                ...(exportBoys ? boysData.map((ed) => ({ label: 'Boys', eventData: ed })) : []),
                ...(exportGirls ? girlsData.map((ed) => ({ label: 'Girls', eventData: ed })) : []),
              ].map(({ label, eventData }, i) => {
                const isRelay = eventData.data.some((row) => row.isRelay);
                const currentYear = new Date().getFullYear();
                return (
                  <div key={i} className="records-preview-event">
                    <p className="records-preview-event-title">
                      {label} — {eventData.eventName}
                    </p>
                    <table>
                      <thead>
                        <tr>
                          <th>Place</th>
                          <th>Time</th>
                          {isRelay ? (
                            <>
                              <th>Swimmer 1</th>
                              <th>Swimmer 2</th>
                              <th>Swimmer 3</th>
                              <th>Swimmer 4</th>
                            </>
                          ) : (
                            <th>Swimmer(s)</th>
                          )}
                          <th>Year</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eventData.data.map((row, j) => (
                          <tr key={j} className={row.Year === currentYear ? 'records-preview-current-year' : ''}>
                            <td>{row.Place}</td>
                            <td>{row.Time}</td>
                            {isRelay ? (
                              <>
                                <td>{row.Swimmers[0] || ''}</td>
                                <td>{row.Swimmers[1] || ''}</td>
                                <td>{row.Swimmers[2] || ''}</td>
                                <td>{row.Swimmers[3] || ''}</td>
                              </>
                            ) : (
                              <td>{row.Swimmers.join(', ')}</td>
                            )}
                            <td>{row.Year}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <Link className="records-back-link" to="/records">
        &larr; Back to Team Records
      </Link>
    </div>
  );
}
