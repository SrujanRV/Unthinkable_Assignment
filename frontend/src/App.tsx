import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import HealthDashboard from './components/HealthDashboard';
import { LogOut, User, Activity } from 'lucide-react';

function MainContent() {
  const { isAuthenticated, user, logout, loading } = useAuth();
  const [isLoginView, setIsLoginView] = useState(true);
  const [showHealth, setShowHealth] = useState(false);

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
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 transition-colors"
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
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎟️</span>
            <span className="font-extrabold text-gray-900 text-lg">Antigravity Tickets</span>
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main dashboard content */}
      <main className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8 text-center sm:text-left">
          <h1 className="text-2xl font-bold text-gray-900">Hello, {user?.email}!</h1>
          <p className="text-gray-500 mt-1">
            You are logged in with the role of <strong className="text-indigo-600 uppercase">{user?.role}</strong>.
            The ticketing system layout and booking forms are ready to be integrated.
          </p>
        </div>

        <div>
          <div className="border-b border-gray-200 pb-3 mb-6">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-1.5">
              <Activity className="w-5 h-5 text-indigo-500" />
              System Status
            </h2>
          </div>
          <HealthDashboard />
        </div>
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
