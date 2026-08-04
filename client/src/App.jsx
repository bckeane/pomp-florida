import { Routes, Route } from 'react-router';
import HomePage from './HomePage.jsx';
import AdminRoster from './AdminRoster.jsx';
import RegisterPage from './RegisterPage.jsx';
import FaqPage from './FaqPage.jsx';
import ForgotPasswordPage from './ForgotPasswordPage.jsx';
import ResetPasswordPage from './ResetPasswordPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/admin" element={<AdminRoster />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
    </Routes>
  );
}
