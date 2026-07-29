import { Routes, Route } from 'react-router-dom';
import AdminRoster from './AdminRoster.jsx';
import RegisterPage from './RegisterPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AdminRoster />} />
      <Route path="/register" element={<RegisterPage />} />
    </Routes>
  );
}
