import { Routes, Route } from 'react-router-dom';
import HomePage from './HomePage.jsx';
import AdminRoster from './AdminRoster.jsx';
import RegisterPage from './RegisterPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin" element={<AdminRoster />} />
      <Route path="/register" element={<RegisterPage />} />
    </Routes>
  );
}
