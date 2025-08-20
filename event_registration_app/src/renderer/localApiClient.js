// src/renderer/localApiClient.js

let LOCAL_API_URL = 'http://192.168.1.100:4000'; // Default, will be configured in settings
let LOCAL_API_SECRET = 'your-super-secret-key-for-local-network'; // Must match the secret in main.js

/**
 * A helper for making fetch requests to the Local API Hub.
 * @param {string} endpoint - The API endpoint (e.g., '/participants').
 * @param {object} options - The options for the fetch call.
 * @returns {Promise<object>} - The JSON response from the local server.
 */
async function localApiFetch(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': LOCAL_API_SECRET, // Add the security key to every request
    ...options.headers,
  };

  try {
    const response = await fetch(`${LOCAL_API_URL}/api${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Local API Hub request failed.');
    }
    return await response.json();
  } catch (err) {
    console.error('Local API Fetch Error:', err);
    return { success: false, message: err.message };
  }
}

/**
 * A client for interacting with the Local API Hub server.
 */
export const localApiClient = {
  /**
   * Configures the client with the Local Admin Hub's details.
   * @param {string} newUrl - The IP address and port of the hub (e.g., 'http://192.168.1.100:4000').
   * @param {string} newSecret - The shared secret API key.
   */
  configure: (newUrl, newSecret) => {
    if (newUrl) LOCAL_API_URL = newUrl;
    if (newSecret) LOCAL_API_SECRET = newSecret;
  },

  /**
   * Performs a GET request to the local hub.
   * @param {string} endpoint - The API endpoint.
   */
  get: (endpoint) => {
    return localApiFetch(endpoint, { method: 'GET' });
  },

  /**
   * Performs a POST request to the local hub.
   * @param {string} endpoint - The API endpoint.
   * @param {object} body - The JSON payload.
   */
  post: (endpoint, body) => {
    return localApiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  
  // Add PUT and DELETE methods here if needed
};