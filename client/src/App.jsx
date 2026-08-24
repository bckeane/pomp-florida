import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router';
import HomePage from './HomePage.jsx';
import AdminRoster from './AdminRoster.jsx';
import RegisterPage from './RegisterPage.jsx';
import FaqPage from './FaqPage.jsx';
import ForgotPasswordPage from './ForgotPasswordPage.jsx';
import ResetPasswordPage from './ResetPasswordPage.jsx';
import NotFoundPage from './NotFoundPage.jsx';
import PrivacyPage from './PrivacyPage.jsx';
import RecordsPage from './RecordsPage.jsx';
import Top20Page from './Top20Page.jsx';
import SwimmerSearchPage from './SwimmerSearchPage.jsx';
import { RecordsErrorBoundary } from './components/RecordsErrorBoundary.jsx';

// xlsx/jspdf/jspdf-autotable are real bundle weight for a low-frequency,
// coach-only page — lazy-loaded so the other 3 (far more visited) records
// pages don't pay for them.
const Top25ExportPage = lazy(() => import('./Top25ExportPage.jsx'));

function RecordsRoute({ children }) {
  return <RecordsErrorBoundary>{children}</RecordsErrorBoundary>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/admin" element={<AdminRoster />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route
        path="/records"
        element={
          <RecordsRoute>
            <RecordsPage />
          </RecordsRoute>
        }
      />
      <Route
        path="/records/top20/:eventId"
        element={
          <RecordsRoute>
            <Top20Page />
          </RecordsRoute>
        }
      />
      <Route
        path="/records/search"
        element={
          <RecordsRoute>
            <SwimmerSearchPage />
          </RecordsRoute>
        }
      />
      <Route
        path="/records/top25-export"
        element={
          <RecordsRoute>
            <Suspense fallback={<div className="home-page records-page"><p className="hint">Loading…</p></div>}>
              <Top25ExportPage />
            </Suspense>
          </RecordsRoute>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
