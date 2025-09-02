// src/renderer/apiClient.js

/**
 * A client for making HTTP requests to the central server API.
 * This will be used by admin-only components that manage the central database.
 */
export const apiClient = {
  _fetch: async function(endpoint, options) {
    // Assumes the central server is running on localhost:3001
    const baseUrl = 'http://localhost:3001/api';
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${baseUrl}${endpoint}`, { ...options, headers });
    return response.json();
  },
  async_get: function(endpoint, params) {
    const url = params ? `${endpoint}?${new URLSearchParams(params)}` : endpoint;
    return this._fetch(url, { method: 'GET' });
   },
  async_post: function(endpoint, body) { return this._fetch(endpoint, { method: 'POST', body: JSON.stringify(body) }); },
  async_put: function(endpoint, body) { return this._fetch(endpoint, { method: 'PUT', body: JSON.stringify(body) }); },
  async_delete: function(endpoint) { return this._fetch(endpoint, { method: 'DELETE' }); }
};
