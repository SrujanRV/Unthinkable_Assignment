import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import HealthDashboard from './components/HealthDashboard';
import AdminPanel from './components/AdminPanel';
import OrganiserPanel from './components/OrganiserPanel';
import BrowseEvents from './components/BrowseEvents';
import MyBookings from './components/MyBookings';
import { LogOut, User, Activity, Shield, LayoutGrid, Music, Ticket, Clock } from 'lucide-react';
import axios from 'axios';

function MainContent() {
  const { isAuthenticated, user, logout, loading, globalHold, setGlobalHold, selectedShow, setSelectedShow } = useAuth();
  const [isLoginView, setIsLoginView] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'admin' | 'organiser' | 'health' | 'bookings'>('dashboard');

  const isAdmin = user?.role === 'ADMIN';
  const isOrganiser = user?.role === 'ORGANISER';

  const [globalCountdown, setGlobalCountdown] = useState<number>(0);

  useEffect(() => {
    if (!globalHold) {
      setGlobalCountdown(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(globalHold.heldUntil).getTime() - Date.now()) / 1000),
      );
      setGlobalCountdown(remaining);
      if (remaining === 0) {
        setGlobalHold(null);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [globalHold, setGlobalHold]);

  const [globalConfirmLoading, setGlobalConfirmLoading] = useState(false);

  const handleCancelGlobalHold = async () => {
    if (!globalHold) return;
    try {
      await axios.post(`/api/shows/${globalHold.showId}/release`, {
        seatIds: globalHold.seatIds,
      });
    } catch (e) {
      console.error('Failed to release held seats:', e);
    } finally {
      setGlobalHold(null);
      setSelectedShow(null);
    }
  };

  const handleGoToCheckout = async () => {
    if (!globalHold) return;
    setGlobalConfirmLoading(true);
    try {
      await axios.post(`/api/shows/${globalHold.showId}/checkout`, {
        seatIds: globalHold.seatIds,
      });
      setGlobalHold(null);
      setSelectedShow(null);
      setActiveTab('bookings');
      alert('Booking confirmed successfully! You can view your ticket and QR code below.');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to confirm booking. Your hold may have expired.');
      setGlobalHold(null);
      setSelectedShow(null);
    } finally {
      setGlobalConfirmLoading(false);
    }
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Set default tab on authentication or user change
  useEffect(() => {
    if (user) {
      if (user.role === 'ADMIN') {
        setActiveTab('admin');
      } else if (user.role === 'ORGANISER') {
        setActiveTab('organiser');
      } else {
        setActiveTab('dashboard');
      }
    }
  }, [user]);

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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
          <span className="text-6xl">🎟️</span>
          <h2 className="mt-4 text-3xl font-extrabold text-white tracking-tight">
            Antigravity Tickets
          </h2>
          <p className="mt-2 text-sm text-indigo-300">
            High-Concurrency Ticket Booking Platform
          </p>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md flex justify-center mb-6">
          {isLoginView ? (
            <LoginPage onToggleMode={() => setIsLoginView(false)} />
          ) : (
            <RegisterPage onToggleMode={() => setIsLoginView(true)} />
          )}
        </div>
      </div>
    );
  }

  const isCustomer = user?.role === 'CUSTOMER';

  // Logged-in View
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header bar */}
      <header className="bg-gradient-to-r from-slate-900 to-indigo-950 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🎟️</span>
              <span className="font-extrabold text-white text-lg tracking-tight">Antigravity Tickets</span>
            </div>

            {/* Navigation Tabs */}
            <nav className="hidden sm:flex items-center space-x-1">
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none ${
                    activeTab === 'admin'
                      ? 'bg-white/15 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  Admin
                </button>
              )}
              {isOrganiser && (
                <button
                  onClick={() => setActiveTab('organiser')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none ${
                    activeTab === 'organiser'
                      ? 'bg-white/15 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Music className="w-4 h-4" />
                  Organiser Hub
                </button>
              )}
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none ${
                  activeTab === 'dashboard'
                    ? 'bg-white/15 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                Browse
              </button>
              {isCustomer && (
                <button
                  onClick={() => setActiveTab('bookings')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none ${
                    activeTab === 'bookings'
                      ? 'bg-white/15 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Ticket className="w-4 h-4" />
                  My Tickets
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('health')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none ${
                    activeTab === 'health'
                      ? 'bg-white/15 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Activity className="w-4 h-4" />
                  Health
                </button>
              )}
            </nav>
          </div>


          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-white/80 bg-white/10 px-3 py-1.5 rounded-lg border border-white/10">
              <User className="w-3.5 h-3.5 text-white/60" />
              <span className="font-medium text-white/90 text-xs">{user?.email}</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                isAdmin ? 'bg-amber-400/20 text-amber-200' :
                isOrganiser ? 'bg-violet-400/20 text-violet-200' :
                'bg-emerald-400/20 text-emerald-200'
              }`}>
                {user?.role}
              </span>
            </div>

            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white/80 hover:text-white hover:bg-white/10 rounded-lg border border-white/15 transition-colors focus:outline-none"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main dashboard content */}
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
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
            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white shadow-lg">
              <div className="flex items-start gap-4">
                <span className="text-4xl">🎟️</span>
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight">Welcome back!</h1>
                  <p className="text-indigo-200 mt-1 text-sm">
                    {isAdmin
                      ? 'Use the navigation above to manage venues, check system health, or browse events.'
                      : isOrganiser
                      ? 'Switch to Organiser Hub to manage your listings, or browse events below.'
                      : 'Browse upcoming movies and concerts below, then select seats to book your tickets.'}
                  </p>
                </div>
              </div>
            </div>
            <BrowseEvents />
          </div>
        )}

        {activeTab === 'bookings' && isCustomer && (
          <div className="space-y-6">
            <MyBookings />
          </div>
        )}

        {activeTab === 'health' && isAdmin && (
          <div>
            <div className="border-b border-gray-200 pb-3 mb-6">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-1.5">
                <Activity className="w-5 h-5 text-indigo-500" />
                Service Health Metrics
              </h2>
            </div>
            <HealthDashboard />
          </div>
        )}
      </main>

      {/* Global Hold Pop-up / Banner */}
      {globalHold && (!selectedShow || selectedShow.showId !== globalHold.showId || activeTab !== 'dashboard') && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full bg-amber-50 border border-amber-300 rounded-xl shadow-lg p-4">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 mt-0.5 animate-pulse flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-bold text-amber-900 text-sm">Waiting Confirmation</h4>
              <p className="text-xs text-amber-700 mt-1">
                You held seats <strong className="text-amber-900 font-mono">{globalHold.seatIds.join(', ')}</strong>. Complete booking before it expires.
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-250">
                  {formatCountdown(globalCountdown)}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancelGlobalHold}
                    disabled={globalConfirmLoading}
                    className="text-xs font-semibold px-2 py-1 text-amber-700 hover:bg-amber-100 rounded border border-amber-200 transition-colors disabled:opacity-50"
                  >
                    Cancel Hold
                  </button>
                  <button
                    onClick={handleGoToCheckout}
                    disabled={globalConfirmLoading}
                    className="text-xs font-semibold px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded shadow-sm transition-colors disabled:opacity-50"
                  >
                    {globalConfirmLoading ? 'Confirming...' : 'Confirm Booking'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
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
