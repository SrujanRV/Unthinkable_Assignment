import { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import HealthDashboard from './components/HealthDashboard';
import AdminPanel from './components/AdminPanel';
import OrganiserPanel from './components/OrganiserPanel';
import BrowseEvents from './components/BrowseEvents';
import MyBookings from './components/MyBookings';
import { LogOut, User, Activity, Shield, LayoutGrid, Music, Ticket, Clock, Moon, Sun } from 'lucide-react';
import axios from 'axios';
import { io } from 'socket.io-client';

function MainContent() {
  const { isAuthenticated, user, logout, loading, globalHold, setGlobalHold, selectedShow, setSelectedShow } = useAuth();
  const [isLoginView, setIsLoginView] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'admin' | 'organiser' | 'health' | 'bookings'>('dashboard');

  const isAdmin = user?.role === 'ADMIN';
  const isOrganiser = user?.role === 'ORGANISER';

  // Dark mode — persisted to localStorage, applied to <html> element
  const [darkMode, setDarkMode] = useState<boolean>(() => localStorage.getItem('darkMode') === 'true');
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

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

  // ── Waitlist Active Offer Popup Banner State & Handlers ─────────────────
  const [waitlistOffers, setWaitlistOffers] = useState<any[]>([]);
  const [offerCountdown, setOfferCountdown] = useState<number>(300);
  const [offerActionLoading, setOfferActionLoading] = useState<boolean>(false);

  const fetchWaitlistOffers = useCallback(async () => {
    if (!user || user.role !== 'CUSTOMER') return;
    try {
      const res = await axios.get<{ offers: any[] }>('/api/shows/waitlist/my-offers');
      setWaitlistOffers(res.data.offers || []);
    } catch (e) {}
  }, [user]);

  useEffect(() => {
    fetchWaitlistOffers();
    const interval = setInterval(fetchWaitlistOffers, 3000);

    const socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const socket = io(socketUrl, {
      auth: { token: localStorage.getItem('token') },
      transports: ['websocket', 'polling'],
    });

    socket.on('waitlistOfferIssued', (data: { userId?: string }) => {
      if (!data.userId || data.userId === user?.id) {
        fetchWaitlistOffers();
      }
    });

    socket.on('seatStatusChanged', (data: any) => {
      if (data.heldByUserId === user?.id) {
        fetchWaitlistOffers();
      }
    });

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, [user, fetchWaitlistOffers]);

  useEffect(() => {
    if (waitlistOffers.length === 0) return;
    const currentOffer = waitlistOffers[0];
    const updateTime = () => {
      const remaining = Math.max(0, Math.floor((new Date(currentOffer.offerExpiresAt).getTime() - Date.now()) / 1000));
      setOfferCountdown(remaining);
      if (remaining === 0) {
        setWaitlistOffers((prev) => prev.slice(1));
      }
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [waitlistOffers]);

  const handleConfirmWaitlistOffer = async (offer: any) => {
    setOfferActionLoading(true);
    try {
      const res = await axios.post<{ booking: any }>(`/api/shows/waitlist/offers/${offer.waitlistEntryId}/confirm`);
      setWaitlistOffers((prev) => prev.filter((o) => o.waitlistEntryId !== offer.waitlistEntryId));
      setActiveTab('bookings');
      alert(`🎉 Waitlist offer confirmed! Booking Ref: ${res.data.booking.bookingReference}. You can view your ticket & QR code under My Bookings.`);
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to confirm waitlist offer. It may have expired.');
      fetchWaitlistOffers();
    } finally {
      setOfferActionLoading(false);
    }
  };

  const handleCancelWaitlistOffer = async (offer: any) => {
    setOfferActionLoading(true);
    try {
      await axios.post(`/api/shows/waitlist/offers/${offer.waitlistEntryId}/cancel`);
      setWaitlistOffers((prev) => prev.filter((o) => o.waitlistEntryId !== offer.waitlistEntryId));
    } catch (err: any) {
      console.error('Failed to cancel waitlist offer:', err);
    } finally {
      setOfferActionLoading(false);
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
            Grabaseat
          </h2>
          <p className="mt-2 text-sm text-indigo-300">
            Movies &amp; concerts — book in seconds
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
      {/* Header bar */}
      <header className="bg-gradient-to-r from-slate-900 to-indigo-950 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🎟️</span>
              <span className="font-extrabold text-white text-lg tracking-tight">Grabaseat</span>
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

            {/* Dark mode toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-white/70 hover:text-white hover:bg-white/10 border border-white/15 transition-colors focus:outline-none"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

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
            <div className="border-b border-gray-200 dark:border-slate-700 pb-3 mb-6">
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
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
        <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-xl shadow-lg p-4 transition-colors">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 animate-pulse flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-bold text-amber-900 dark:text-amber-200 text-sm">Waiting Confirmation</h4>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                You held seats <strong className="text-amber-900 dark:text-amber-200 font-mono">{globalHold.seatIds.join(', ')}</strong>. Complete booking before it expires.
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded border border-amber-250 dark:border-amber-700">
                  {formatCountdown(globalCountdown)}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancelGlobalHold}
                    disabled={globalConfirmLoading}
                    className="text-xs font-semibold px-2 py-1 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded border border-amber-200 dark:border-amber-700 transition-colors disabled:opacity-50"
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

      {/* Waitlist Offer Pop-up / Banner */}
      {waitlistOffers.length > 0 && (
        <div className="fixed bottom-4 left-4 z-50 max-w-sm w-full bg-gradient-to-r from-indigo-900 to-indigo-950 text-white border border-indigo-500/50 rounded-xl shadow-2xl p-4 transition-all">
          <div className="flex items-start gap-3">
            <Ticket className="w-6 h-6 text-amber-400 mt-0.5 flex-shrink-0 animate-pulse" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-amber-300 text-sm">🎉 Waitlist Offer Ready!</h4>
                <span className="text-[10px] font-extrabold bg-amber-400 text-indigo-950 px-2 py-0.5 rounded shadow-sm">
                  5 Min Offer
                </span>
              </div>
              <p className="text-xs text-indigo-100 mt-1.5 leading-relaxed">
                Queue ended! Seat <strong className="text-amber-300 font-mono text-sm">{waitlistOffers[0].seatLabel}</strong> ({waitlistOffers[0].categoryName}) for <span className="font-semibold">{waitlistOffers[0].eventTitle}</span> has been offered to you!
              </p>
              <div className="mt-3.5 flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold text-amber-300 bg-indigo-950 px-2.5 py-1 rounded border border-indigo-700">
                  ⏳ {formatCountdown(offerCountdown)}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCancelWaitlistOffer(waitlistOffers[0])}
                    disabled={offerActionLoading}
                    className="text-xs font-semibold px-2.5 py-1 text-indigo-200 hover:bg-indigo-800/60 rounded border border-indigo-700 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleConfirmWaitlistOffer(waitlistOffers[0])}
                    disabled={offerActionLoading}
                    className="text-xs font-bold px-3 py-1 bg-amber-400 hover:bg-amber-300 text-indigo-950 rounded shadow-md transition-all disabled:opacity-50"
                  >
                    {offerActionLoading ? 'Booking...' : 'Confirm Booking'}
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
