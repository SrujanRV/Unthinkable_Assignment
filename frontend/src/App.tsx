import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import HealthDashboard from './components/HealthDashboard';
import AdminPanel from './components/AdminPanel';
import OrganiserPanel from './components/OrganiserPanel';
import BrowseEvents from './components/BrowseEvents';
import MyBookings from './components/MyBookings';
import { LogOut, User, Activity, Shield, LayoutGrid, Music, Ticket } from 'lucide-react';

function MainContent() {
  const { isAuthenticated, user, logout, loading } = useAuth();
  const [isLoginView, setIsLoginView] = useState(true);
  const [showHealth, setShowHealth] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'admin' | 'organiser' | 'health' | 'bookings'>('dashboard');

  const isAdmin = user?.role === 'ADMIN';
  const isOrganiser = user?.role === 'ORGANISER';

  // Set default tab on authentication
  useState(() => {
    if (user?.role === 'ADMIN') {
      setActiveTab('admin');
    } else if (user?.role === 'ORGANISER') {
      setActiveTab('organiser');
    }
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-500 text-sm">Initializing application...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
          <span className="text-5xl">🎟️</span>
          <h2 className="mt-4 text-3xl font-extrabold text-gray-900 tracking-tight">
            Antigravity Tickets
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            High-Concurrency Ticket Booking System
          </p>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md flex justify-center mb-6">
          {isLoginView ? (
            <LoginPage onToggleMode={() => setIsLoginView(false)} />
          ) : (
            <RegisterPage onToggleMode={() => setIsLoginView(true)} />
          )}
        </div>

        {/* Toggleable Health status during login */}
        <div className="sm:mx-auto sm:w-full sm:max-w-xl text-center">
          <button
            onClick={() => setShowHealth(!showHealth)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 transition-colors focus:outline-none"
          >
            <Activity className="w-3.5 h-3.5" />
            {showHealth ? 'Hide Connection Health' : 'Show Connection Health'}
          </button>
          {showHealth && (
            <div className="mt-4 text-left">
              <HealthDashboard />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Logged-in View
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎟️</span>
              <span className="font-extrabold text-gray-900 text-lg">Antigravity Tickets</span>
            </div>

            {/* Navigation Tabs */}
            <nav className="hidden sm:flex space-x-2">
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none ${
                    activeTab === 'admin'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  Admin Panel
                </button>
              )}
              {isOrganiser && (
                <button
                  onClick={() => setActiveTab('organiser')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none ${
                    activeTab === 'organiser'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Music className="w-4 h-4" />
                  Organiser Panel
                </button>
              )}
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none ${
                  activeTab === 'dashboard'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('bookings')}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none ${
                  activeTab === 'bookings'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Ticket className="w-4 h-4" />
                My Bookings
              </button>
              <button
                onClick={() => setActiveTab('health')}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none ${
                  activeTab === 'health'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Activity className="w-4 h-4" />
                System Health
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
              <User className="w-4 h-4 text-gray-500" />
              <span className="font-medium">{user?.email}</span>
              <span className="text-xs bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded uppercase">
                {user?.role}
              </span>
            </div>

            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors focus:outline-none"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main dashboard content */}
      <main className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        {activeTab === 'admin' && isAdmin && (
          <div className="space-y-6">
            <AdminPanel />
          </div>
        )}

        {activeTab === 'organiser' && isOrganiser && (
          <div className="space-y-6">
            <OrganiserPanel />
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center sm:text-left">
              <h1 className="text-2xl font-bold text-gray-900">Hello, {user?.email}!</h1>
              <p className="text-gray-500 mt-1">
                You are logged in as <strong className="text-indigo-600 uppercase">{user?.role}</strong>.
                {isAdmin ? (
                  <span> Use the tabs above to manage venues and layouts, or check system logs.</span>
                ) : isOrganiser ? (
                  <span> Use the Organiser Panel to list new events and manage tickets pricing.</span>
                ) : (
                  <span> Welcome to the ticketing platform! Search and book your seats below.</span>
                )}
              </p>
            </div>
            <BrowseEvents />
          </div>
        )}

        {activeTab === 'bookings' && (
          <div className="space-y-6">
            <MyBookings />
          </div>
        )}

        {activeTab === 'health' && (
          <div>
            <div className="border-b border-gray-200 pb-3 mb-6">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-1.5">
                <Activity className="w-5 h-5 text-indigo-500" />
                Service Health Metrics
              </h2>
            </div>
            <HealthDashboard />
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}
