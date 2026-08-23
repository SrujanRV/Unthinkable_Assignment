import { useEffect, useState } from 'react';
import axios from 'axios';
import { ShieldCheck, ShieldAlert, RefreshCw, Database, HardDrive, Cpu } from 'lucide-react';

interface HealthStatus {
  status: string;
  timestamp: string;
  services: {
    database: string;
    redis: string;
  };
}

export default function HealthDashboard() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      // Axios request to proxy '/api/health' (configured in vite.config.ts)
      const response = await axios.get<HealthStatus>('/api/health');
      setHealth(response.data);
    } catch (err: any) {
      console.error('Error fetching health status:', err);
      setError(
        err.response?.data?.error?.message ||
          'Failed to connect to backend server. Make sure it is running on port 5000.',
      );
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000); // refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'connected':
        return 'text-green-500 bg-green-50 border-green-200';
      case 'degraded':
        return 'text-amber-500 bg-amber-50 border-amber-200';
      default:
        return 'text-red-500 bg-red-50 border-red-200';
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-10 p-6 bg-white rounded-xl shadow-md border border-gray-150">
      <div className="flex items-center justify-between pb-5 border-b border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            Ticket Booking System
          </h1>
          <p className="text-sm text-gray-500">Service Health Dashboard</p>
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-gray-50 rounded-lg transition-colors border border-gray-200 shadow-sm disabled:opacity-50"
          title="Refresh connection status"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="my-6">
        {error && (
          <div className="p-4 mb-4 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200 flex items-start gap-2">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Backend Unreachable: </span>
              {error}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Backend Health Card */}
          <div className="p-4 rounded-lg border border-gray-100 bg-gray-50 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Backend API
              </span>
              <Cpu className="w-5 h-5 text-gray-400" />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xl font-bold text-gray-800">
                {error ? 'Offline' : 'Online'}
              </span>
              <span
                className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                  error ? 'text-red-500 bg-red-50 border-red-200' : 'text-green-500 bg-green-50 border-green-200'
                }`}
              >
                {error ? 'FAIL' : 'OK'}
              </span>
            </div>
          </div>

          {/* Database Health Card */}
          <div className="p-4 rounded-lg border border-gray-100 bg-gray-50 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                PostgreSQL DB
              </span>
              <Database className="w-5 h-5 text-gray-400" />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xl font-bold text-gray-800">
                {health?.services.database === 'connected' ? 'Connected' : 'Offline'}
              </span>
              <span
                className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getStatusColor(
                  health?.services.database || 'disconnected',
                )}`}
              >
                {health?.services.database === 'connected' ? 'OK' : 'FAIL'}
              </span>
            </div>
          </div>

          {/* Redis Health Card */}
          <div className="p-4 rounded-lg border border-gray-100 bg-gray-50 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Redis Cache
              </span>
              <HardDrive className="w-5 h-5 text-gray-400" />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xl font-bold text-gray-800">
                {health?.services.redis === 'connected' ? 'Connected' : 'Offline'}
              </span>
              <span
                className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getStatusColor(
                  health?.services.redis || 'disconnected',
                )}`}
              >
                {health?.services.redis === 'connected' ? 'OK' : 'FAIL'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-100 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          {health?.status === 'healthy' ? (
            <ShieldCheck className="w-4 h-4 text-green-500" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-amber-500" />
          )}
          <span>System Status: </span>
          <span className="font-semibold uppercase text-gray-600">
            {health ? health.status : 'offline'}
          </span>
        </div>
        {health && (
          <span>
            Last checked: {new Date(health.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
