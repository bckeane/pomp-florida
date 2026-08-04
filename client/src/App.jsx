import { Routes, Route } from 'react-router';
import HomePage from './HomePage.jsx';
import AdminRoster from './AdminRoster.jsx';
import RegisterPage from './RegisterPage.jsx';
import FaqPage from './FaqPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/admin" element={<AdminRoster />} />
      <Route path="/register" element={<RegisterPage />} />
    </Routes>
  );
}
