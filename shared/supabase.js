/**
 * ============================================================
 * FEISTY SHARED SUPABASE CLIENT
 * 
 * Purpose: Centralized Supabase client configuration
 * Used by: Landing, Web Order, POS, Admin Dashboard
 * ============================================================
 */

const SUPABASE_URL = window.SUPABASE_URL || 'https://ztefkcbgkdqgvcfphvys.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0ZWZrY2Jna2RxZ3ZjZnBodnlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NzAzMzMsImV4cCI6MjA4NzQ0NjMzM30.xSoIe07K-C120ecvg1gpCJJgOSdKO-NFlba7pK0otMI';

/**
 * Supabase Client Configuration
 * Uses the anon key for client-side operations
 */
class FeistySupabase {
  constructor() {
    this.url = SUPABASE_URL;
    this.anonKey = SUPABASE_ANON_KEY;
  }

  /**
   * Get Supabase client instance
   * Uses the global supabase-js if available
   */
  getClient() {
    if (typeof window !== 'undefined' && window.supabase) {
      return window.supabase;
    }
    
    // Fallback: create simple fetch wrapper
    return {
      from: (table) => this.createQueryBuilder(table),
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        signInWithPassword: () => Promise.resolve({ data: { user: null }, error: null }),
        signOut: () => Promise.resolve({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
      }
    };
  }

  /**
   * Create a simple query builder for CRUD operations
   */
  createQueryBuilder(table) {
    return {
      table,
      
      // SELECT
      select: (columns = '*') => {
        return {
          query: { type: 'select', table, columns },
          eq: (column, value) => {
            return {
              query: { type: 'select', table, columns, filters: [{ column, value, operator: 'eq' }] },
              single: () => this.execute({ type: 'select', table, columns, filters: [{ column, value, operator: 'eq' }], limit: 1 }),
              then: (resolve) => this.execute({ type: 'select', table, columns, filters: [{ column, value, operator: 'eq' }] }).then(resolve),
              limit: (n) => this.execute({ type: 'select', table, columns, filters: [{ column, value, operator: 'eq' }], limit: n })
            };
          },
          then: (resolve) => this.execute({ type: 'select', table, columns }).then(resolve),
          order: (column, options) => ({ query: { type: 'select', table, columns, order: { column, ...options } } })
        };
      },

      // INSERT
      insert: (data) => {
        return {
          then: (resolve) => this.execute({ type: 'insert', table, data }).then(resolve),
          select: () => ({
            then: (resolve) => this.execute({ type: 'insert', table, data, returning: 'representation' }).then(resolve)
          })
        };
      },

      // UPDATE
      update: (data) => {
        return {
          eq: (column, value) => {
            return {
              then: (resolve) => this.execute({ type: 'update', table, data, filters: [{ column, value, operator: 'eq' }] }).then(resolve)
            };
          }
        };
      },

      // DELETE
      delete: () => {
        return {
          eq: (column, value) => {
            return {
              then: (resolve) => this.execute({ type: 'delete', table, filters: [{ column, value, operator: 'eq' }] }).then(resolve)
            };
          }
        };
      }
    };
  }

  /**
   * Execute a query via REST API
   */
  async execute(params) {
    const { type, table, columns, filters, data, limit, returning, order } = params;
    
    let url = `${this.url}/rest/v1/${table}`;
    const queryParams = [];
    
    // Handle filters
    if (filters && filters.length > 0) {
      filters.forEach(f => {
        queryParams.push(`${f.column}=${encodeURIComponent(f.value)}`);
      });
    }
    
    // Handle select
    if (type === 'select') {
      if (columns && columns !== '*') {
        queryParams.push(`select=${columns}`);
      }
      if (limit) {
        queryParams.push(`limit=${limit}`);
      }
      if (order) {
        queryParams.push(`order=${order.ascending === false ? order.column + '.desc' : order.column}`);
      }
    }
    
    if (queryParams.length > 0) {
      url += '?' + queryParams.join('&');
    }
    
    const headers = {
      'apikey': this.anonKey,
      'Authorization': `Bearer ${this.anonKey}`,
      'Content-Type': 'application/json',
      'Prefer': returning === 'representation' ? 'return=representation' : 'return=minimal'
    };
    
    try {
      let response;
      
      switch (type) {
        case 'select':
          response = await fetch(url, { headers });
          break;
        case 'insert':
          response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
          });
          break;
        case 'update':
          response = await fetch(url, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(data)
          });
          break;
        case 'delete':
          response = await fetch(url, {
            method: 'DELETE',
            headers
          });
          break;
      }
      
      if (!response.ok) {
        const error = await response.text();
        return { data: null, error: { message: error } };
      }
      
      const result = await response.json();
      return { data: result, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Call a PostgreSQL function
   */
  async rpc(functionName, params = {}) {
    const url = `${this.url}/rest/v1/rpc/${functionName}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${this.anonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });
      
      if (!response.ok) {
        const error = await response.text();
        return { data: null, error: { message: error } };
      }
      
      const result = await response.json();
      return { data: result, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Subscribe to realtime changes
   */
  channel(channelName) {
    return {
      on: (eventType, config, callback) => {
        // For now, return a dummy subscription
        // In production, this would use Supabase Realtime
        return {
          subscribe: () => ({ status: 'SUBSCRIBED' }),
          unsubscribe: () => {}
        };
      },
      subscribe: () => ({ status: 'SUBSCRIBED' })
    };
  }
}

// Create global instance
window.FeistySupabase = new FeistySupabase();

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FeistySupabase;
}
