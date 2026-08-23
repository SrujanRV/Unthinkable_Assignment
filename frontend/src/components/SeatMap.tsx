import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { Clock, ShoppingCart, UserCheck, ShieldAlert, Loader } from 'lucide-react';

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

const BACKEND_URL = 'http://localhost:5000';

export default function SeatMap({ showId, venueName, onBack }: SeatMapProps) {
  const { user, token } = useAuth();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPrices, setShowPrices] = useState<{ [catId: string]: number }>({});
  
  const socketRef = useRef<Socket | null>(null);

  // Fetch seat map details and pricing
  const fetchSeatMap = async () => {
    try {
      // 1. Fetch seat statuses
      const seatsRes = await axios.get<{ seats: Seat[] }>(`/api/shows/${showId}/seats`);
      setSeats(seatsRes.data.seats);

      // 2. Fetch show pricing
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

    // Initialize Socket.io connection
    const socket = io(BACKEND_URL, {
      auth: { token },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket.io] Connected to server, joining room...');
      socket.emit('joinShow', showId);
    });

    // Listen to real-time seat updates
    socket.on(
      'seatStatusUpdate',
      (data: { seatId: string; status: 'AVAILABLE' | 'HELD' | 'BOOKED'; heldByUserId: string | null; heldUntil: string | null }) => {
        console.log('[Socket.io] Seat status update received:', data);
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

    socket.on('disconnect', () => {
      console.log('[Socket.io] Disconnected from server');
    });

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leaveShow', showId);
        socketRef.current.disconnect();
      }
    };
  }, [showId, token]);

  const handleSeatClick = (seat: Seat) => {
    // We only allow selecting AVAILABLE seats (or seats already held by me to potentially book)
    const isHeldByMe = seat.status === 'HELD' && seat.heldByUserId === user?.id;
    const isAvailable = seat.status === 'AVAILABLE';

    if (!isAvailable && !isHeldByMe) return;

    setSelectedSeatIds((prev) =>
      prev.includes(seat.seatId) ? prev.filter((id) => id !== seat.seatId) : [...prev, seat.seatId],
    );
  };

  // Group seats by row to render layout
  const rows: { [row: string]: Seat[] } = {};
  seats.forEach((seat) => {
    if (!rows[seat.row]) {
      rows[seat.row] = [];
    }
    rows[seat.row].push(seat);
  });

  // Sort rows and columns
  const sortedRows = Object.keys(rows).sort();
  sortedRows.forEach((rowKey) => {
    rows[rowKey].sort((a, b) => a.number - b.number);
  });

  const getSeatColor = (seat: Seat) => {
    const isSelected = selectedSeatIds.includes(seat.seatId);
    const isHeldByMe = seat.status === 'HELD' && seat.heldByUserId === user?.id;

    if (isSelected) return 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700 scale-95';
    if (seat.status === 'BOOKED') return 'bg-red-500 border-red-600 text-white cursor-not-allowed opacity-80';
    if (seat.status === 'HELD') {
      if (isHeldByMe) return 'bg-amber-500 border-amber-600 text-white hover:bg-amber-600';
      return 'bg-gray-300 border-gray-400 text-gray-500 cursor-not-allowed';
    }
    // Available colors based on category
    if (seat.categoryName.toLowerCase() === 'premium') {
      return 'bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-600';
    }
    return 'bg-blue-500 border-blue-600 text-white hover:bg-blue-600';
  };

  const getSelectedSeatsPrice = () => {
    let total = 0;
    selectedSeatIds.forEach((id) => {
      const seat = seats.find((s) => s.seatId === id);
      if (seat) {
        total += showPrices[seat.categoryId] || 0;
      }
    });
    return total;
  };

  // Mock checkout handler (will be wired up in Booking flow)
  const handleHoldSeats = async () => {
    if (selectedSeatIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      // Endpoint to lock/hold seats will be hit here
      // For this UI phase, we will display an alert or trigger seat lock simulation
      const responses = await Promise.all(
        selectedSeatIds.map((id) =>
          axios.post(`/api/shows/${showId}/seats/${id}/hold`),
        ),
      );
      console.log('Holds created:', responses);
      setSelectedSeatIds([]);
      fetchSeatMap();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to hold selected seats. Another user may have locked them.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && seats.length === 0) {
    return (
      <div className="p-12 text-center">
        <Loader className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Loading seating arrangement...</p>
      </div>
    );
  }

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
        {/* Seats Visual Layout (Editable Visual Grid) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-gray-800 text-sm">Select Your Seats</h4>
            <div className="text-xs text-gray-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Holds expire after 10 mins</span>
            </div>
          </div>

          {/* Interactive Screen Grid */}
          <div className="p-8 border border-gray-200 rounded-xl bg-gray-900 overflow-x-auto min-h-[300px] flex flex-col items-center justify-center relative select-none">
            {/* Stage/Screen Indicator */}
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
                    const isHeldByMe = seat.status === 'HELD' && seat.heldByUserId === user?.id;
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

          {/* Seat Grid Legends */}
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

        {/* Selected Seats and Checkout Pane */}
        <div className="space-y-6">
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
            <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
              <ShoppingCart className="w-4.5 h-4.5 text-indigo-500" />
              Reservation Summary
            </h4>

            {selectedSeatIds.length === 0 ? (
              <div className="py-6 text-center text-gray-400 text-xs">
                No seats selected. Click available seats on the map to hold them.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {selectedSeatIds.map((id) => {
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

                <button
                  onClick={handleHoldSeats}
                  disabled={loading}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-sm shadow transition-colors disabled:opacity-50"
                >
                  <UserCheck className="w-4 h-4" />
                  Hold Seats (10 Min Lock)
                </button>
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
