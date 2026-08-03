const rawApiBase = import.meta.env.VITE_API_BASE_URL?.trim();

// Keep local dev behavior (/api via Vite proxy) while allowing a hosted API URL.
export const API_BASE = rawApiBase ? rawApiBase.replace(/\/+$/, '') : '/api';