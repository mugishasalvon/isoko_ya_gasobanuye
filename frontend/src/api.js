import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    config.headers.delete('Content-Type');
  }
  return config;
});

export function assetUrl(source) {
  if (!source) return '';
  if (/^https?:\/\//i.test(source)) return source;
  const apiOrigin = new URL(api.defaults.baseURL, window.location.origin).origin;
  return new URL(source.replace(/^\/+/, ''), `${apiOrigin}/`).toString();
}

export function getErrorMessage(error) {
  return error.response?.data?.error || error.message || 'Something went wrong.';
}
