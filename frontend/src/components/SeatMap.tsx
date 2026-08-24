import { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import {
  Clock, ShoppingCart, UserCheck, ShieldAlert, Loader,
  Trash2, CheckCircle2, Mail, ExternalLink, Users,
  AlertTriangle, CreditCard,
} from 'lucide-react';

interface Seat {
  id: string;
  seatId: string;
  row: string;
  number: number;
  categoryId: string;
  categoryName: string;
  status: 'AVAILABLE' | 'HELD' | 'BOOKED';
  heldByUserId: string | null;
  heldUntil: string | null;
}

interface SeatMapProps {
  showId: string;
  eventId: string;
  venueName: string;
  onBack: () => void;
}

interface BookingResult {
  id: string;
  bookingReference: string;
  totalPrice: number;
  seats: string[];
  emailPreviewUrl: string | null;
  qrCodeDataUrl: string;
}

type View = 'map' | 'checkout' | 'success';

const BACKEND_URL = 'http://localhost:5000';

export default function SeatMap({ showId, eventId, venueName, onBack }: SeatMapProps) {
  const { user, token, setGlobalHold } = useAuth();

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const [seats, setSeats] = useState<Seat[]>([]);
  const [showPrices, setShowPrices] = useState<{ [catId: string]: number }>({});
  const [loading, setLoading] = useState(true);

  // Client-side only selection — no server hold until "Proceed to Booking"
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);

  // Server-confirmed hold state
  const [heldSeatIds, setHeldSeatIds] = useState<string[]>([]);
  const [heldUntil, setHeldUntil] = useState<string | null>(null); // ISO timestamp from server
  const [countdown, setCountdown] = useState(0);

  const [view, setView] = useState<View>('map');
  const [error, setError] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const heldSeatIdsRef = useRef<string[]>([]);

  useEffect(() => { heldSeatIdsRef.current = heldSeatIds; }, [heldSeatIds]);

  // ── Fetch seat map + pricing ──────────────────────────────────────────────
  const fetchSeatMap = useCallback(async () => {
    try {
      const [seatsRes, showRes] = await Promise.all([
        axios.get<{ seats: Seat[] }>(`/api/shows/${showId}/seats`),
        axios.get<{ show: any }>(`/api/shows/${showId}`),
      ]);
      const allSeats = seatsRes.data.seats;
      setSeats(allSeats);

      const prices: { [catId: string]: number } = {};
      showRes.data.show.showPrices.forEach((sp: any) => {
        prices[sp.seatCategoryId] = Number(sp.price);
      });
      setShowPrices(prices);

      // Restore hold state if navigating back mid-hold (e.g. waitlist claim)
      const heldByMe = allSeats.filter(
        (s) => s.status === 'HELD' && s.heldByUserId === user?.id,
      );
      if (heldByMe.length > 0 && heldSeatIdsRef.current.length === 0) {
        const earliest = heldByMe.reduce((a, b) =>
          !a.heldUntil ? b : !b.heldUntil ? a :
          new Date(a.heldUntil) < new Date(b.heldUntil) ? a : b,
        );
        setHeldSeatIds(heldByMe.map((s) => s.seatId));
        setHeldUntil(earliest.heldUntil);
        setView('checkout');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load seating map');
    } finally {
      setLoading(false);
    }
  }, [showId, user?.id]);

  // ── Socket.io + initial fetch ─────────────────────────────────────────────
  useEffect(() => {
    fetchSeatMap();

    const socket = io(BACKEND_URL, { auth: { token } });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('joinShow', showId));
    socket.on('seatStatusChanged', (data: {
      seatId: string; status: 'AVAILABLE' | 'HELD' | 'BOOKED';
      heldByUserId: string | null; heldUntil: string | null;
    }) => {
      setSeats((prev) =>
        prev.map((s) => s.seatId === data.seatId
          ? { ...s, status: data.status, heldByUserId: data.heldByUserId, heldUntil: data.heldUntil }
          : s,
        ),
      );
      // Deselect any seat that just got taken by someone else
      if (data.status !== 'AVAILABLE' && data.heldByUserId !== userRef.current?.id) {
        setSelectedSeatIds((prev) => prev.filter((id) => id !== data.seatId));
      }
    });

    return () => {
      socket.emit('leaveShow', showId);
      socket.disconnect();
    };
  }, [showId, token]);

  // ── Countdown — derived from server heldUntil, NOT from page-load time ────
  const handleExpiry = useCallback(async () => {
    const held = heldSeatIdsRef.current;
    if (held.length > 0) {
      await axios.post(`/api/shows/${showId}/release`, { seatIds: held }).catch(() => {});
    }
    setGlobalHold(null);
    setHeldSeatIds([]);
    setHeldUntil(null);
    setSelectedSeatIds([]);
    setView('map');
    setError('Your seat hold expired. The seats have been released — please reselect.');
    fetchSeatMap();
  }, [showId, fetchSeatMap, setGlobalHold]);

  useEffect(() => {
    if (!heldUntil) { setCountdown(0); return; }
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(heldUntil).getTime() - Date.now()) / 1000),
      );
      setCountdown(remaining);
      if (remaining === 0) handleExpiry();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [heldUntil, handleExpiry]);

  // ── Seat click — client-side toggle ONLY, no backend call ────────────────
  const handleSeatClick = (seat: Seat) => {
    if (view !== 'map') return;
    if (seat.status === 'BOOKED') return;
    if (seat.status === 'HELD' && seat.heldByUserId !== user?.id) return;
    setConflictMsg(null);
    setSelectedSeatIds((prev) =>
      prev.includes(seat.seatId)
        ? prev.filter((id) => id !== seat.seatId)
        : [...prev, seat.seatId],
    );
  };

  // ── Proceed to Booking — all-or-nothing hold POST ────────────────────────
  const handleProceedToBooking = async () => {
    if (selectedSeatIds.length === 0) return;
    setLoading(true);
    setConflictMsg(null);
    setError(null);
    try {
      const res = await axios.post<{ heldUntil: string }>(
        `/api/shows/${showId}/hold`,
        { seatIds: selectedSeatIds },
      );
      // Every seat in the batch was atomically locked on the server
      setGlobalHold({
        showId,
        eventId,
        venueName,
        seatIds: selectedSeatIds,
        heldUntil: res.data.heldUntil,
      });
      setHeldSeatIds(selectedSeatIds);
      setHeldUntil(res.data.heldUntil);
      setSelectedSeatIds([]);
      setView('checkout');
      fetchSeatMap();
    } catch (err: any) {
      if (err.response?.status === 409) {
        const { conflictingSeatIds, message } = err.response.data.error;
        // Deselect contested seats and mark them held locally
        setSelectedSeatIds((prev) => prev.filter((id) => !conflictingSeatIds.includes(id)));
        setSeats((prev) =>
          prev.map((s) => conflictingSeatIds.includes(s.seatId) ? { ...s, status: 'HELD' } : s),
        );
        setConflictMsg(message);
      } else {
        setError(err.response?.data?.error?.message || 'Failed to hold seats. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Cancel hold — immediate server release, back to map ──────────────────
  const handleCancelHold = async () => {
    if (heldSeatIds.length === 0) return;
    setLoading(true);
    try {
      await axios.post(`/api/shows/${showId}/release`, { seatIds: heldSeatIds });
      setGlobalHold(null);
      setHeldSeatIds([]);
      setHeldUntil(null);
      setView('map');
      fetchSeatMap();
    } catch {
      setError('Failed to release holds. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Confirm Booking — checkout ────────────────────────────────────────────
  const handleConfirmBooking = async () => {
    if (heldSeatIds.length === 0) return;
    setCheckoutLoading(true);
    setError(null);
    try {
      const res = await axios.post<{ booking: BookingResult }>(
        `/api/shows/${showId}/checkout`,
        { seatIds: heldSeatIds },
      );
      setGlobalHold(null);
      setBookingResult(res.data.booking);
      setHeldSeatIds([]);
      setHeldUntil(null);
      setView('success');
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Checkout failed. Your hold may have expired.';
      setError(msg);
      if (err.response?.status === 400) {
        setGlobalHold(null);
        setHeldSeatIds([]);
        setHeldUntil(null);
        setView('map');
        fetchSeatMap();
      }
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleJoinWaitlist = async (catId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<{ message: string; waitlistEntry: { position: number } }>(
        `/api/shows/${showId}/waitlist`,
        { seatCategoryId: catId },
      );
      alert(`Joined waitlist! Your position: #${res.data.waitlistEntry.position}`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to join waitlist.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getPrice = (seatId: string) => {
    const seat = seats.find((s) => s.seatId === seatId);
    return seat ? showPrices[seat.categoryId] || 0 : 0;
  };
  const getTotalPrice = (ids: string[]) => ids.reduce((sum, id) => sum + getPrice(id), 0);

  // ── Grid helpers ──────────────────────────────────────────────────────────
  const rows: { [row: string]: Seat[] } = {};
  seats.forEach((seat) => {
    if (!rows[seat.row]) rows[seat.row] = [];
    rows[seat.row].push(seat);
  });
  const sortedRows = Object.keys(rows).sort();
  sortedRows.forEach((r) => rows[r].sort((a, b) => a.number - b.number));

  const categoryStatus: { [catId: string]: { name: string; availableCount: number } } = {};
  seats.forEach((seat) => {
    if (!categoryStatus[seat.categoryId])
      categoryStatus[seat.categoryId] = { name: seat.categoryName, availableCount: 0 };
    if (seat.status === 'AVAILABLE' || (seat.status === 'HELD' && seat.heldByUserId === user?.id))
      categoryStatus[seat.categoryId].availableCount++;
  });
  const soldOutCategories = Object.keys(categoryStatus).filter(
    (id) => categoryStatus[id].availableCount === 0,
  );

  const CATEGORY_PALETTES = [
    'bg-blue-500 border-blue-600 text-white hover:bg-blue-600',
    'bg-violet-500 border-violet-600 text-white hover:bg-violet-600',
    'bg-yellow-400 border-yellow-500 text-gray-900 hover:bg-yellow-500',
    'bg-teal-500 border-teal-600 text-white hover:bg-teal-600',
    'bg-rose-500 border-rose-600 text-white hover:bg-rose-600',
    'bg-cyan-500 border-cyan-600 text-white hover:bg-cyan-600',
    'bg-fuchsia-500 border-fuchsia-600 text-white hover:bg-fuchsia-600',
    'bg-lime-500 border-lime-600 text-white hover:bg-lime-600',
  ];
  const CATEGORY_LEGEND_COLORS = [
    'bg-blue-500 border-blue-600', 'bg-violet-500 border-violet-600',
    'bg-yellow-400 border-yellow-500', 'bg-teal-500 border-teal-600',
    'bg-rose-500 border-rose-600', 'bg-cyan-500 border-cyan-600',
    'bg-fuchsia-500 border-fuchsia-600', 'bg-lime-500 border-lime-600',
  ];
  const categoryOrder: string[] = [];
  seats.forEach((s) => { if (!categoryOrder.includes(s.categoryId)) categoryOrder.push(s.categoryId); });
  const getCategoryPalette = (catId: string) =>
    CATEGORY_PALETTES[categoryOrder.indexOf(catId) % CATEGORY_PALETTES.length];
  const getCategoryLegendColor = (catId: string) =>
    CATEGORY_LEGEND_COLORS[categoryOrder.indexOf(catId) % CATEGORY_LEGEND_COLORS.length];

  const getSeatColor = (seat: Seat) => {
    const isSelected = selectedSeatIds.includes(seat.seatId);
    const isHeldByMe = seat.status === 'HELD' && seat.heldByUserId === user?.id;
    if (isSelected) return 'bg-indigo-600 border-indigo-700 text-white scale-95';
    if (seat.status === 'BOOKED') return 'bg-red-500 border-red-600 text-white cursor-not-allowed opacity-80';
    if (seat.status === 'HELD') {
      if (isHeldByMe) return 'bg-amber-500 border-amber-600 text-white animate-pulse';
      return 'bg-gray-300 border-gray-400 text-gray-500 cursor-not-allowed';
    }
    return getCategoryPalette(seat.categoryId);
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading && seats.length === 0) {
    return (
      <div className="p-12 text-center">
        <Loader className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Loading seating arrangement...</p>
      </div>
    );
  }

  // ── SUCCESS VIEW ──────────────────────────────────────────────────────────
  if (view === 'success' && bookingResult) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden max-w-md mx-auto my-8 transition-colors">
        <div className="bg-emerald-600 px-6 py-8 text-white text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto mb-3 text-emerald-100" />
          <h3 className="text-2xl font-bold">Booking Confirmed!</h3>
          <p className="text-xs text-emerald-100 mt-1">Thank you for booking with Grabaseat</p>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            {([
              ['Booking Reference', <strong key="ref" className="font-mono">{bookingResult.bookingReference}</strong>],
              ['Venue', venueName],
              ['Seats Booked', bookingResult.seats.join(', ')],
              ['Amount Paid', <strong key="amt" className="text-emerald-600 dark:text-emerald-400">${bookingResult.totalPrice.toFixed(2)}</strong>],
            ] as [string, React.ReactNode][]).map(([label, val], i) => (
              <div key={i} className="flex justify-between items-center text-xs text-gray-500 dark:text-slate-400 pb-2 border-b border-gray-100 dark:border-slate-700">
                <span>{label}</span><span className="text-sm text-gray-800 dark:text-gray-100">{val}</span>
              </div>
            ))}
          </div>
          <div className="p-4 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-center space-y-2">
            <span className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Your Ticket QR Entry</span>
            <img src={bookingResult.qrCodeDataUrl} alt="Ticket QR Code" className="w-48 h-48 mx-auto border-2 border-white dark:border-slate-600 rounded shadow-sm" />
            <p className="text-[10px] text-gray-400 dark:text-slate-500">Scan this QR code at the event entrance.</p>
          </div>
          {bookingResult.emailPreviewUrl && (
            <a href={bookingResult.emailPreviewUrl} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg text-xs font-bold transition-colors">
              <Mail className="w-4 h-4" /> View Confirmation Email <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button onClick={() => { setView('map'); onBack(); }}
            className="w-full py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-bold text-xs shadow transition-colors">
            Back to Event Directory
          </button>
        </div>
      </div>
    );
  }

  // ── CHECKOUT VIEW — Hold details + server-timestamp countdown ─────────────
  if (view === 'checkout') {
    const isExpiringSoon = countdown > 0 && countdown <= 60;
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden max-w-lg mx-auto my-8 transition-colors">
        <div className="bg-indigo-900 px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <CreditCard className="w-5 h-5" /> Confirm Your Booking
            </h3>
            <p className="text-xs text-indigo-200 mt-0.5">Complete before your hold expires</p>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono font-bold text-sm ${
            isExpiringSoon
              ? 'bg-red-600 border-red-500 text-white animate-pulse'
              : 'bg-indigo-800 border-indigo-700 text-amber-300'
          }`}>
            <Clock className="w-4 h-4" />
            {countdown > 0 ? formatTime(countdown) : 'Expired'}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
            </div>
          )}
          {isExpiringSoon && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span><strong>Hurry!</strong> Your hold expires in under a minute.</span>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Held Seats</h4>
            <div className="rounded-lg border border-gray-200 dark:border-slate-600 overflow-hidden">
              {heldSeatIds.map((seatId) => {
                const seat = seats.find((s) => s.seatId === seatId);
                return (
                  <div key={seatId} className="flex justify-between items-center px-4 py-2.5 border-b border-gray-100 dark:border-slate-700 last:border-0 text-sm dark:bg-slate-700/50">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-800 dark:text-gray-100">Seat {seat?.row}{seat?.number}</span>
                      <span className="text-[10px] bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-500 px-1.5 py-0.5 rounded uppercase font-semibold">{seat?.categoryName}</span>
                    </div>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">${getPrice(seatId).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-slate-600 font-bold text-base text-gray-800 dark:text-gray-100">
            <span>Total</span>
            <span className="text-indigo-600 dark:text-indigo-400 text-xl">${getTotalPrice(heldSeatIds).toFixed(2)}</span>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={handleCancelHold} disabled={loading || checkoutLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> Cancel Hold
            </button>
            <button onClick={handleConfirmBooking} disabled={loading || checkoutLoading || countdown === 0}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm shadow transition-colors disabled:opacity-50">
              {checkoutLoading ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Confirm Booking
            </button>
          </div>

          <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
            <span><strong>Hold Policy:</strong> Your seats are server-locked for {formatTime(countdown)}. Cancelling immediately frees them for other users.</span>
          </div>
        </div>
      </div>
    );
  }

  // ── MAP VIEW — client-side selection only ─────────────────────────────────
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden transition-colors">
      <div className="bg-indigo-900 px-6 py-4 text-white flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">🛋️ Seating Map</h3>
          <p className="text-xs text-indigo-200">Click seats to select — hold created only when you proceed</p>
        </div>
        <button onClick={onBack}
          className="text-xs font-semibold px-3 py-1.5 bg-indigo-800 hover:bg-indigo-700 rounded-md border border-indigo-700 transition-colors">
          Back to Events
        </button>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Seat grid */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-gray-800 dark:text-gray-100 text-sm">Select Your Seats</h4>
            <div className="text-xs text-gray-400 dark:text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /><span>Hold created only when you proceed</span>
            </div>
          </div>

          <div className="p-8 border border-gray-200 dark:border-slate-700 rounded-xl bg-gray-900 overflow-x-auto min-h-[300px] flex flex-col items-center justify-center relative select-none">
            <div className="w-2/3 h-2 bg-indigo-500/20 border-b border-indigo-500 rounded-full text-center text-[10px] text-indigo-300 font-bold uppercase tracking-widest pb-4 mb-10">
              STAGE / SCREEN
            </div>

            {conflictMsg && (
              <div className="flex items-start gap-2 p-3 mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg w-full max-w-md">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
                <span>{conflictMsg} — contested seats have been deselected. Please choose alternatives.</span>
              </div>
            )}
            {error && (
              <div className="p-3 mb-4 text-xs text-red-700 bg-red-50 rounded border border-red-200 w-full max-w-md">{error}</div>
            )}

            <div className="flex flex-col gap-3 py-4">
              {sortedRows.map((rowLabel) => (
                <div key={rowLabel} className="flex gap-2.5 items-center">
                  <div className="w-8 text-center text-sm font-extrabold text-indigo-400">{rowLabel}</div>
                  {rows[rowLabel].map((seat) => {
                    const isHeldByMe = seat.status === 'HELD' && seat.heldByUserId === user?.id;
                    const price = showPrices[seat.categoryId] || 0;
                    return (
                      <button key={seat.id} type="button" onClick={() => handleSeatClick(seat)}
                        disabled={seat.status === 'BOOKED' || (seat.status === 'HELD' && !isHeldByMe)}
                        className={`w-10 h-10 rounded border font-semibold text-[10px] tracking-tighter flex flex-col items-center justify-center shadow-sm transition-all select-none active:scale-95 ${getSeatColor(seat)}`}
                        title={`${seat.categoryName} · ${rowLabel}${seat.number} · $${price.toFixed(2)} · ${seat.status}`}>
                        <span>{rowLabel}{seat.number}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="p-4 bg-gray-50 dark:bg-slate-700 border border-gray-150 dark:border-slate-600 rounded-xl flex flex-wrap gap-4 items-center justify-center text-xs">
            <span className="font-semibold text-gray-500 dark:text-slate-400 mr-2">Legend:</span>
            {categoryOrder.map((catId) => (
              <div key={catId} className="flex items-center gap-1.5">
                <span className={`w-3.5 h-3.5 rounded border ${getCategoryLegendColor(catId)}`}></span>
                <span className="text-gray-600 dark:text-slate-300">{categoryStatus[catId]?.name ?? catId} (Available)</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 bg-indigo-600 border border-indigo-700 rounded"></span>
              <span className="text-gray-600 dark:text-slate-300">Selected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 bg-gray-300 border border-gray-400 rounded"></span>
              <span className="text-gray-600 dark:text-slate-300">Held by Others</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 bg-red-500 border border-red-600 rounded"></span>
              <span className="text-gray-600 dark:text-slate-300">Booked</span>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 space-y-4">
            <h4 className="font-bold text-gray-800 dark:text-gray-100 text-sm flex items-center gap-1.5">
              <ShoppingCart className="w-4.5 h-4.5 text-indigo-500" /> Your Selection
            </h4>

            {selectedSeatIds.length === 0 ? (
              <div className="py-6 text-center text-gray-400 dark:text-slate-500 text-xs">
                Click available seats on the map to select them.<br />
                <span className="text-indigo-400 font-semibold">No hold is created until you proceed.</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {selectedSeatIds.map((id) => {
                    const seat = seats.find((s) => s.seatId === id);
                    return (
                      <div key={id} className="flex justify-between items-center p-2 bg-white dark:bg-slate-600 border border-gray-200 dark:border-slate-500 rounded-lg text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-gray-800 dark:text-gray-100">Seat {seat?.row}{seat?.number}</span>
                          <span className="text-[9px] bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-500 px-1 py-0.5 rounded uppercase font-semibold">{seat?.categoryName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">${getPrice(id).toFixed(2)}</span>
                          <button onClick={() => setSelectedSeatIds((prev) => prev.filter((x) => x !== id))}
                            className="text-gray-400 hover:text-red-500 transition-colors text-base leading-none">×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-gray-200 dark:border-slate-600 flex justify-between items-center font-bold text-sm text-gray-800 dark:text-gray-100">
                  <span>Total</span>
                  <span className="text-indigo-600 dark:text-indigo-400 text-lg">${getTotalPrice(selectedSeatIds).toFixed(2)}</span>
                </div>

                <button onClick={handleProceedToBooking} disabled={loading}
                  className="w-full mt-2 flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm shadow transition-colors disabled:opacity-50">
                  {loading ? <Loader className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                  Proceed to Booking
                </button>
                <p className="text-[10px] text-gray-400 dark:text-slate-500 text-center">
                  All seats held atomically — if any conflict, none are held.
                </p>
              </div>
            )}
          </div>

          {soldOutCategories.length > 0 && (
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-200 dark:border-indigo-700 space-y-3">
              <h4 className="font-bold text-indigo-900 dark:text-indigo-300 text-xs flex items-center gap-1.5">
                <Users className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" /> Queue Waitlist Active
              </h4>
              <p className="text-[10px] text-indigo-700 dark:text-indigo-400">Join the waitlist for priority offers when seats free up.</p>
              <div className="space-y-2">
                {soldOutCategories.map((catId) => (
                  <div key={catId} className="flex justify-between items-center p-2.5 bg-white dark:bg-slate-700 border border-indigo-150 dark:border-indigo-700 rounded-lg text-xs">
                    <span className="font-bold text-gray-700 dark:text-gray-200">{categoryStatus[catId].name}</span>
                    <button onClick={() => handleJoinWaitlist(catId)} disabled={loading}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-bold transition-colors">
                      Join Queue
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <ShieldAlert className="w-4.5 h-4.5 mt-0.5 flex-shrink-0 text-amber-500" />
            <div>
              <span className="font-bold">Hold Policy:</span> Proceeding atomically holds <em>all</em> selected seats or <em>none</em>.
              If any seat was just taken, you'll see which ones to replace before any hold is created.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


