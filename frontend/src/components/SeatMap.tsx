import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { Clock, ShoppingCart, UserCheck, ShieldAlert, Loader, Trash2, CheckCircle2, Mail, ExternalLink } from 'lucide-react';

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

const BACKEND_URL = 'http://localhost:5000';

export default function SeatMap({ showId, venueName, onBack }: SeatMapProps) {
  const { user, token } = useAuth();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [myHeldSeatIds, setMyHeldSeatIds] = useState<string[]>([]);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPrices, setShowPrices] = useState<{ [catId: string]: number }>({});
  
  const socketRef = useRef<Socket | null>(null);
  const myHeldSeatIdsRef = useRef<string[]>([]);

  // Keep ref in sync for unmount cleanup
  useEffect(() => {
    myHeldSeatIdsRef.current = myHeldSeatIds;
  }, [myHeldSeatIds]);

  // Fetch seat map details and pricing
  const fetchSeatMap = async () => {
    try {
      const seatsRes = await axios.get<{ seats: Seat[] }>(`/api/shows/${showId}/seats`);
      setSeats(seatsRes.data.seats);

      const showRes = await axios.get<{ show: any }>(`/api/shows/${showId}`);
      const prices: { [catId: string]: number } = {};
      showRes.data.show.showPrices.forEach((sp: any) => {
        prices[sp.seatCategoryId] = Number(sp.price);
      });
      setShowPrices(prices);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load seating map');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeatMap();

    const socket = io(BACKEND_URL, {
      auth: { token },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('joinShow', showId);
    });

    socket.on(
      'seatStatusUpdate',
      (data: { seatId: string; status: 'AVAILABLE' | 'HELD' | 'BOOKED'; heldByUserId: string | null; heldUntil: string | null }) => {
        setSeats((prevSeats) =>
          prevSeats.map((seat) =>
            seat.seatId === data.seatId
              ? {
                  ...seat,
                  status: data.status,
                  heldByUserId: data.heldByUserId,
                  heldUntil: data.heldUntil,
                }
              : seat,
          ),
        );
      },
    );

    return () => {
      // Release active holds on unmount
      const held = myHeldSeatIdsRef.current;
      if (held.length > 0) {
        axios.post(`/api/shows/${showId}/release`, { seatIds: held }).catch((err) => {
          console.error('[Cleanup] Failed to release holds on unmount:', err);
        });
      }

      if (socketRef.current) {
        socketRef.current.emit('leaveShow', showId);
        socketRef.current.disconnect();
      }
    };
  }, [showId, token]);

  // Countdown timer effect
  useEffect(() => {
    if (!holdExpiresAt) {
      setCountdown(0);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((new Date(holdExpiresAt).getTime() - Date.now()) / 1000));
      setCountdown(remaining);

      if (remaining === 0) {
        setMyHeldSeatIds([]);
        setHoldExpiresAt(null);
        setError('Your seat holds have expired. The seats have been released.');
        fetchSeatMap();
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  const handleSeatClick = (seat: Seat) => {
    const isHeldByMe = seat.status === 'HELD' && seat.heldByUserId === user?.id;
    const isAvailable = seat.status === 'AVAILABLE';

    if (!isAvailable && !isHeldByMe) return;

    if (myHeldSeatIds.includes(seat.seatId)) {
      handleReleaseIndividualSeat(seat.seatId);
      return;
    }

    setSelectedSeatIds((prev) =>
      prev.includes(seat.seatId) ? prev.filter((id) => id !== seat.seatId) : [...prev, seat.seatId],
    );
  };

  const handleHoldSeats = async () => {
    if (selectedSeatIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<{ heldUntil: string }>(`/api/shows/${showId}/hold`, {
        seatIds: selectedSeatIds,
      });
      setMyHeldSeatIds(selectedSeatIds);
      setHoldExpiresAt(res.data.heldUntil);
      setSelectedSeatIds([]);
      fetchSeatMap();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to lock seats.');
    } finally {
      setLoading(false);
    }
  };

  const handleReleaseHolds = async () => {
    if (myHeldSeatIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      await axios.post(`/api/shows/${showId}/release`, {
        seatIds: myHeldSeatIds,
      });
      setMyHeldSeatIds([]);
      setHoldExpiresAt(null);
      fetchSeatMap();
    } catch (err: any) {
      setError('Failed to release holds');
    } finally {
      setLoading(false);
    }
  };

  const handleReleaseIndividualSeat = async (seatId: string) => {
    try {
      await axios.post(`/api/shows/${showId}/release`, {
        seatIds: [seatId],
      });
      setMyHeldSeatIds((prev) => prev.filter((id) => id !== seatId));
      if (myHeldSeatIds.length <= 1) {
        setHoldExpiresAt(null);
      }
      fetchSeatMap();
    } catch (err) {
      console.error('Error releasing seat:', err);
    }
  };

  const handleCheckout = async () => {
    if (myHeldSeatIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<{ booking: BookingResult }>(`/api/shows/${showId}/checkout`, {
        seatIds: myHeldSeatIds,
      });
      // Store success result (this triggers success screen)
      setBookingResult(res.data.booking);
      setMyHeldSeatIds([]);
      setHoldExpiresAt(null);
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
        'Checkout failed. Your seat holds may have expired.'
      );
      // Refresh to reflect releases
      fetchSeatMap();
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const rows: { [row: string]: Seat[] } = {};
  seats.forEach((seat) => {
    if (!rows[seat.row]) {
      rows[seat.row] = [];
    }
    rows[seat.row].push(seat);
  });

  const sortedRows = Object.keys(rows).sort();
  sortedRows.forEach((rowKey) => {
    rows[rowKey].sort((a, b) => a.number - b.number);
  });

  const getSeatColor = (seat: Seat) => {
    const isSelected = selectedSeatIds.includes(seat.seatId);
    const isHeldByMe = (seat.status === 'HELD' && seat.heldByUserId === user?.id) || myHeldSeatIds.includes(seat.seatId);

    if (isSelected) return 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700 scale-95';
    if (seat.status === 'BOOKED') return 'bg-red-500 border-red-600 text-white cursor-not-allowed opacity-80';
    if (seat.status === 'HELD') {
      if (isHeldByMe) return 'bg-amber-500 border-amber-600 text-white hover:bg-amber-600 animate-pulse';
      return 'bg-gray-300 border-gray-400 text-gray-500 cursor-not-allowed';
    }
    if (seat.categoryName.toLowerCase() === 'premium') {
      return 'bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-600';
    }
    return 'bg-blue-500 border-blue-600 text-white hover:bg-blue-600';
  };

  const getSelectedSeatsPrice = () => {
    let total = 0;
    const activeIds = myHeldSeatIds.length > 0 ? myHeldSeatIds : selectedSeatIds;
    activeIds.forEach((id) => {
      const seat = seats.find((s) => s.seatId === id);
      if (seat) {
        total += showPrices[seat.categoryId] || 0;
      }
    });
    return total;
  };

  if (loading && seats.length === 0) {
    return (
      <div className="p-12 text-center">
        <Loader className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Loading seating arrangement...</p>
      </div>
    );
  }

  // Booking Success Screen Render
  if (bookingResult) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-md mx-auto my-8">
        <div className="bg-emerald-600 px-6 py-8 text-white text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto mb-3 text-emerald-100" />
          <h3 className="text-2xl font-bold">Booking Confirmed!</h3>
          <p className="text-xs text-emerald-100 mt-1">Thank you for booking with Antigravity Tickets</p>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs text-gray-500 pb-2 border-b border-gray-100">
              <span>Booking Reference</span>
              <strong className="text-sm text-gray-800 font-mono">{bookingResult.bookingReference}</strong>
            </div>
            <div className="flex justify-between items-center text-xs text-gray-500 pb-2 border-b border-gray-100">
              <span>Venue</span>
              <strong className="text-sm text-gray-800">{venueName}</strong>
            </div>
            <div className="flex justify-between items-center text-xs text-gray-500 pb-2 border-b border-gray-100">
              <span>Seats Booked</span>
              <strong className="text-sm text-gray-800">{bookingResult.seats.join(', ')}</strong>
            </div>
            <div className="flex justify-between items-center text-xs text-gray-500 pb-2 border-b border-gray-100">
              <span>Amount Paid</span>
              <strong className="text-sm text-emerald-600 font-bold">${bookingResult.totalPrice.toFixed(2)}</strong>
            </div>
          </div>

          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-center space-y-2">
            <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Your Ticket QR Entry</span>
            <img src={bookingResult.qrCodeDataUrl} alt="Ticket QR Code" className="w-48 h-48 mx-auto border-2 border-white rounded shadow-sm" />
            <p className="text-[10px] text-gray-400">Scan this QR code at the event entrance.</p>
          </div>

          {bookingResult.emailPreviewUrl && (
            <a
              href={bookingResult.emailPreviewUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-colors"
            >
              <Mail className="w-4.5 h-4.5" />
              View Sent Confirmation Email
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <button
            onClick={() => {
              setBookingResult(null);
              onBack();
            }}
            className="w-full py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-bold text-xs shadow transition-colors"
          >
            Back to Event Directory
          </button>
        </div>
      </div>
    );
  }

  const activeSeatIds = myHeldSeatIds.length > 0 ? myHeldSeatIds : selectedSeatIds;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-indigo-900 px-6 py-4 text-white flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">🛋️ Seating Map Visualizer</h3>
          <p className="text-xs text-indigo-200">Interactive live seat locking for {venueName}</p>
        </div>
        <button
          onClick={onBack}
          className="text-xs font-semibold px-3 py-1.5 bg-indigo-800 hover:bg-indigo-700 rounded-md border border-indigo-700 transition-colors"
        >
          Back to Events
        </button>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-gray-800 text-sm">Select Your Seats</h4>
            <div className="text-xs text-gray-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Holds expire after 10 mins</span>
            </div>
          </div>

          <div className="p-8 border border-gray-200 rounded-xl bg-gray-900 overflow-x-auto min-h-[300px] flex flex-col items-center justify-center relative select-none">
            <div className="w-2/3 h-2 bg-indigo-500/20 border-b border-indigo-500 shadow-[0_4px_12px_rgba(99,102,241,0.2)] rounded-full text-center text-[10px] text-indigo-300 font-bold uppercase tracking-widest pb-4 mb-10">
              STAGE / SCREEN
            </div>

            {error && (
              <div className="p-3 mb-4 text-xs text-red-700 bg-red-50 rounded border border-red-200 w-full max-w-md">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3 py-4">
              {sortedRows.map((rowLabel) => (
                <div key={rowLabel} className="flex gap-2.5 items-center">
                  <div className="w-8 text-center text-sm font-extrabold text-indigo-400">
                    {rowLabel}
                  </div>
                  {rows[rowLabel].map((seat) => {
                    const isHeldByMe = (seat.status === 'HELD' && seat.heldByUserId === user?.id) || myHeldSeatIds.includes(seat.seatId);
                    const price = showPrices[seat.categoryId] || 0;

                    return (
                      <button
                        key={seat.id}
                        type="button"
                        onClick={() => handleSeatClick(seat)}
                        disabled={seat.status === 'BOOKED' || (seat.status === 'HELD' && !isHeldByMe)}
                        className={`w-10 h-10 rounded border font-semibold text-[10px] tracking-tighter flex flex-col items-center justify-center shadow-sm transition-all select-none active:scale-95 ${getSeatColor(
                          seat,
                        )}`}
                        title={`${seat.categoryName} Seat ${rowLabel}${seat.number} - $${price.toFixed(2)} (${
                          seat.status
                        })`}
                      >
                        <span>
                          {rowLabel}
                          {seat.number}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-gray-50 border border-gray-150 rounded-xl flex flex-wrap gap-4 items-center justify-center text-xs">
            <span className="font-semibold text-gray-500 mr-2">Legend:</span>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 bg-blue-500 border border-blue-600 rounded"></span>
              <span>Standard (Available)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 bg-emerald-500 border border-emerald-600 rounded"></span>
              <span>Premium (Available)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 bg-amber-500 border border-amber-600 rounded"></span>
              <span>Held by Me</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 bg-gray-300 border border-gray-400 rounded"></span>
              <span>Held by Others</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 bg-red-500 border border-red-600 rounded"></span>
              <span>Booked</span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
            <h4 className="font-bold text-gray-800 text-sm flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ShoppingCart className="w-4.5 h-4.5 text-indigo-500" />
                Reservation Summary
              </span>
              {myHeldSeatIds.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded font-mono font-bold animate-pulse">
                  <Clock className="w-3 h-3" />
                  {formatTime(countdown)}
                </span>
              )}
            </h4>

            {activeSeatIds.length === 0 ? (
              <div className="py-6 text-center text-gray-400 text-xs">
                No seats selected. Click available seats on the map to hold them.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {activeSeatIds.map((id) => {
                    const seat = seats.find((s) => s.seatId === id);
                    const price = seat ? showPrices[seat.categoryId] || 0 : 0;
                    return (
                      <div
                        key={id}
                        className="flex justify-between items-center p-2 bg-white border border-gray-200 rounded-lg text-xs"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-gray-800">
                            Seat {seat?.row}
                            {seat?.number}
                          </span>
                          <span className="text-[9px] bg-gray-100 text-gray-600 border border-gray-250 px-1 py-0.5 rounded uppercase font-semibold">
                            {seat?.categoryName}
                          </span>
                        </div>
                        <span className="font-bold text-indigo-600">${price.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-gray-200 flex justify-between items-center font-bold text-sm text-gray-800">
                  <span>Total Amount</span>
                  <span className="text-indigo-600 text-lg">
                    ${getSelectedSeatsPrice().toFixed(2)}
                  </span>
                </div>

                {myHeldSeatIds.length === 0 ? (
                  <button
                    onClick={handleHoldSeats}
                    disabled={loading}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-sm shadow transition-colors disabled:opacity-50"
                  >
                    <UserCheck className="w-4 h-4" />
                    Hold Seats (10 Min Lock)
                  </button>
                ) : (
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handleReleaseHolds}
                      disabled={loading}
                      className="w-1/2 flex items-center justify-center gap-1 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg font-semibold text-xs transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Release Holds
                    </button>
                    <button
                      onClick={handleCheckout}
                      disabled={loading}
                      className="w-1/2 flex items-center justify-center gap-1.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs shadow transition-colors"
                    >
                      Proceed to Pay
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800 flex items-start gap-2">
            <ShieldAlert className="w-4.5 h-4.5 mt-0.5 flex-shrink-0 text-amber-500" />
            <div>
              <span className="font-bold">Hold Policy:</span> Seats held are locked to your session for exactly 10 minutes. 
              If payment or booking confirmation is not completed within that window, the hold is auto-released and offered to waitlist users.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
