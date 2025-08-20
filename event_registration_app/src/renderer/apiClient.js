// apiClient.js - Central Server API Client
class ApiClient {
    constructor() {
        this.baseUrl = 'http://localhost:3001';
        this.authToken = '';
    }

    setBaseUrl(url) {
        this.baseUrl = url.replace(/\/$/, ''); // Remove trailing slash
    }

    setAuthToken(token) {
        this.authToken = token;
    }

    async async_post(endpoint, data) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            
            if (!response.ok) {
                return {
                    success: false,
                    message: result.message || `HTTP ${response.status}: ${response.statusText}`,
                    status: response.status
                };
            }

            return {
                success: true,
                ...result
            };
        } catch (error) {
            console.error('API POST Error:', error);
            return {
                success: false,
                message: error.message || 'Network error occurred'
            };
        }
    }

    async async_get(endpoint, params = {}) {
        try {
            const url = new URL(`${this.baseUrl}${endpoint}`);
            Object.keys(params).forEach(key => {
                if (params[key] !== undefined && params[key] !== null) {
                    url.searchParams.append(key, params[key]);
                }
            });

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
                }
            });

            const result = await response.json();
            
            if (!response.ok) {
                return {
                    success: false,
                    message: result.message || `HTTP ${response.status}: ${response.statusText}`,
                    status: response.status
                };
            }

            return {
                success: true,
                ...result
            };
        } catch (error) {
            console.error('API GET Error:', error);
            return {
                success: false,
                message: error.message || 'Network error occurred'
            };
        }
    }

    async async_put(endpoint, data) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            
            if (!response.ok) {
                return {
                    success: false,
                    message: result.message || `HTTP ${response.status}: ${response.statusText}`,
                    status: response.status
                };
            }

            return {
                success: true,
                ...result
            };
        } catch (error) {
            console.error('API PUT Error:', error);
            return {
                success: false,
                message: error.message || 'Network error occurred'
            };
        }
    }

    async async_delete(endpoint) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
                }
            });

            const result = await response.json();
            
            if (!response.ok) {
                return {
                    success: false,
                    message: result.message || `HTTP ${response.status}: ${response.statusText}`,
                    status: response.status
                };
            }

            return {
                success: true,
                ...result
            };
        } catch (error) {
            console.error('API DELETE Error:', error);
            return {
                success: false,
                message: error.message || 'Network error occurred'
            };
        }
    }

    // Test connection to central server
    async testConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/api/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            return {
                success: response.ok,
                status: response.status,
                message: response.ok ? 'Connection successful' : 'Connection failed'
            };
        } catch (error) {
            return {
                success: false,
                message: `Connection failed: ${error.message}`
            };
        }
    }
}

// Export singleton instance
export const apiClient = new ApiClient();