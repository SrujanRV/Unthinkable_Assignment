import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

export type UserRole = 'CUSTOMER' | 'ORGANISER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  createdAt?: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;
  globalHold: {
    showId: string;
    eventId: string;
    venueName: string;
    seatIds: string[];
    heldUntil: string;
  } | null;
  setGlobalHold: (hold: {
    showId: string;
    eventId: string;
    venueName: string;
    seatIds: string[];
    heldUntil: string;
  } | null) => void;
  selectedShow: {
    showId: string;
    eventId: string;
    venueName: string;
  } | null;
  setSelectedShow: (show: {
    showId: string;
    eventId: string;
    venueName: string;
  } | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [globalHold, setGlobalHoldState] = useState<{
    showId: string;
    eventId: string;
    venueName: string;
    seatIds: string[];
    heldUntil: string;
  } | null>(() => {
    const saved = localStorage.getItem('activeHold');
    if (saved) {
      try {
        const hold = JSON.parse(saved);
        if (new Date(hold.heldUntil) > new Date()) {
          return hold;
        }
      } catch (e) {}
    }
    return null;
  });

  const setGlobalHold = (hold: any) => {
    if (hold) {
      localStorage.setItem('activeHold', JSON.stringify(hold));
    } else {
      localStorage.removeItem('activeHold');
    }
    setGlobalHoldState(hold);
  };

  const [selectedShow, setSelectedShow] = useState<{
    showId: string;
    eventId: string;
    venueName: string;
  } | null>(null);

  // Set default auth header for Axios
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }

  // Check token validity and load profile on startup
  useEffect(() => {
    const initAuth = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await axios.get<{ user: User }>('/api/auth/me');
        setUser(response.data.user);
      } catch (error) {
        console.error('Failed to load user profile on boot:', error);
        logout();
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, [token]);

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post<{ token: string; user: User }>('/api/auth/login', {
        email,
        password,
      });
      const { token: receivedToken, user: receivedUser } = response.data;
      localStorage.setItem('token', receivedToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${receivedToken}`;
      setToken(receivedToken);
      setUser(receivedUser);
    } catch (error: any) {
      const msg = error.response?.data?.error?.message || 'Login failed';
      throw new Error(msg);
    }
  };

  const register = async (email: string, password: string, role: UserRole) => {
    try {
      const response = await axios.post<{ token: string; user: User }>('/api/auth/register', {
        email,
        password,
        role,
      });
      const { token: receivedToken, user: receivedUser } = response.data;
      localStorage.setItem('token', receivedToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${receivedToken}`;
      setToken(receivedToken);
      setUser(receivedUser);
    } catch (error: any) {
      const msg = error.response?.data?.error?.message || 'Registration failed';
      throw new Error(msg);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('activeHold');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    setGlobalHoldState(null);
    setSelectedShow(null);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token && !!user,
        loading,
        login,
        register,
        logout,
        globalHold,
        setGlobalHold,
        selectedShow,
        setSelectedShow,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
