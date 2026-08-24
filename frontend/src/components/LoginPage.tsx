import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, AlertCircle, Loader } from 'lucide-react';

interface LoginPageProps {
  onToggleMode: () => void;
}

export default function LoginPage({ onToggleMode }: LoginPageProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 bg-white dark:bg-slate-800 rounded-xl shadow-md border border-gray-150 dark:border-slate-700 transition-colors">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Welcome Back</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Sign in to your Grabaseat account</p>
      </div>

      {error && (
        <div className="p-4 mb-4 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 dark:text-slate-500">
              <Mail className="w-5 h-5" />
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 block w-full rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700 placeholder-gray-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none sm:text-sm"
              placeholder="you@example.com"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 dark:text-slate-500">
              <Lock className="w-5 h-5" />
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 block w-full rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700 placeholder-gray-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none sm:text-sm"
              placeholder="••••••••"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {loading ? <Loader className="w-5 h-5 animate-spin" /> : 'Sign In'}
        </button>
      </form>

      <div className="text-center mt-6 text-sm">
        <span className="text-gray-500 dark:text-slate-400">Don&apos;t have an account? </span>
        <button
          onClick={onToggleMode}
          className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 focus:outline-none"
        >
          Register here
        </button>
      </div>
    </div>
  );
}
