import { useEffect, useState } from 'react';
import axios from 'axios';
import { Calendar, MapPin, Layers, DollarSign, Ban, Ticket, Loader, CheckCircle2, XCircle } from 'lucide-react';

interface Seat {
  seat: {
    row: string;
    number: number;
  };
}

interface Booking {
  id: string;
  bookingReference: string;
  status: 'CONFIRMED' | 'CANCELLED';
  cancellationReason?: string | null;
  totalAmount: string;
  createdAt: string;
  show: {
    startTime: string;
    event: {
      title: string;
      type: 'MOVIE' | 'CONCERT';
    };
    venue: {
      name: string;
      location: string;
    };
  };
  showSeats: Seat[];
}

export default function MyBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedQrCodeRef, setSelectedQrCodeRef] = useState<string | null>(null);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const res = await axios.get<{ bookings: Booking[] }>('/api/bookings');
      setBookings(res.data.bookings);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to retrieve your bookings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleCancel = async (bookingId: string) => {
    const confirmCancel = window.confirm('Are you sure you want to cancel this booking? This will release your seats immediately.');
    if (!confirmCancel) return;

    setLoading(true);
    setError(null);
    try {
      await axios.post(`/api/bookings/${bookingId}/cancel`);
      alert('Booking cancelled successfully! Any queue waitlists will be offered these seats.');
      fetchBookings();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to cancel booking');
      setLoading(false);
    }
  };

  if (loading && bookings.length === 0) {
    return (
      <div className="py-12 text-center">
        <Loader className="w-10 h-10 animate-spin text-indigo-600 mx-auto" />
        <p className="mt-2 text-sm text-gray-500">Retrieving your ticket bookings...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden transition-colors">
      {/* Header Banner */}
      <div className="bg-indigo-900 px-6 py-4 text-white flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">🎟️ My Booked Tickets</h2>
          <p className="text-xs text-indigo-200">View and manage your upcoming movie &amp; concert bookings</p>
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="p-4 mb-4 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        {bookings.length === 0 ? (
          <div className="p-12 text-center text-gray-400 dark:text-slate-500 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-lg space-y-2">
            <Ticket className="w-12 h-12 mx-auto text-gray-300 dark:text-slate-600" />
            <p className="text-sm font-semibold">No bookings found</p>
            <p className="text-xs max-w-xs mx-auto">You haven&apos;t booked any tickets yet. Head over to the Dashboard to search for active events!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {bookings.map((booking) => {
              const show = booking.show;
              const seatLabels = booking.showSeats.map((ss) => `${ss.seat.row}${ss.seat.number}`).join(', ');
              const isUpcoming = new Date(show.startTime) > new Date();

              return (
                <div
                  key={booking.id}
                  className="p-5 border border-gray-200 dark:border-slate-600 rounded-xl hover:border-gray-350 dark:hover:border-slate-500 hover:shadow-sm dark:bg-slate-700/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
                >
                  <div className="space-y-2.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-gray-800 dark:text-gray-100">{show.event.title}</span>
                      <span className="text-[10px] bg-gray-100 dark:bg-slate-600 text-gray-700 dark:text-slate-300 font-bold px-1.5 py-0.5 rounded uppercase border border-gray-250 dark:border-slate-500">
                        {show.event.type}
                      </span>
                      <span className="font-mono text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded">
                        REF: {booking.bookingReference}
                      </span>
                      <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${
                        booking.status === 'CONFIRMED'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400'
                          : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400'
                      }`}>
                        {booking.status === 'CONFIRMED' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            Confirmed
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" />
                            Cancelled
                          </>
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs text-gray-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4.5 h-4.5 text-indigo-500 flex-shrink-0" />
                        <span>{new Date(show.startTime).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4.5 h-4.5 text-indigo-500 flex-shrink-0" />
                        <span>{show.venue.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 col-span-1 sm:col-span-2 md:col-span-1">
                        <Layers className="w-4.5 h-4.5 text-indigo-500 flex-shrink-0" />
                        <span>Seats: <strong className="text-gray-750 dark:text-gray-200 font-bold">{seatLabels}</strong></span>
                      </div>
                    </div>

                    {booking.status === 'CANCELLED' && (
                      <div className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg border ${
                        booking.cancellationReason === 'Event cancelled by organiser'
                          ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400'
                          : 'bg-gray-50 border-gray-200 text-gray-600 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400'
                      }`}>
                        <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong>Reason: </strong>
                          {booking.cancellationReason === 'Event cancelled by organiser'
                            ? 'This event was cancelled by the organiser.'
                            : 'Cancelled by you.'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 border-t border-gray-100 dark:border-slate-600 md:border-t-0 pt-4 md:pt-0 self-stretch md:self-auto justify-between md:justify-end">
                    <div className="text-left md:text-right">
                      <span className="block text-[10px] text-gray-400 dark:text-slate-500 font-semibold uppercase">Total Paid</span>
                      <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                        <DollarSign className="w-4.5 h-4.5" />
                        {Number(booking.totalAmount).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {booking.status === 'CONFIRMED' && (
                        <>
                          <button
                            onClick={() => setSelectedQrCodeRef(
                              selectedQrCodeRef === booking.bookingReference ? null : booking.bookingReference
                            )}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg transition-colors focus:outline-none"
                          >
                            <Ticket className="w-3.5 h-3.5" />
                            {selectedQrCodeRef === booking.bookingReference ? 'Hide ticket' : 'View ticket'}
                          </button>

                          {isUpcoming && (
                            <button
                              onClick={() => handleCancel(booking.id)}
                              disabled={loading}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-red-650 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg transition-colors focus:outline-none disabled:opacity-50"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              Cancel
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal-like QR Display */}
        {selectedQrCodeRef && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full p-6 text-center space-y-4 shadow-xl border border-gray-100 dark:border-slate-700">
              <div className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-slate-700">
                <span className="font-bold text-gray-800 dark:text-gray-100 text-sm">Entry Ticket Pass</span>
                <button
                  onClick={() => setSelectedQrCodeRef(null)}
                  className="text-xs font-bold text-gray-500 dark:text-slate-400 hover:text-gray-850 dark:hover:text-gray-200 px-2 py-1 bg-gray-100 dark:bg-slate-700 rounded"
                >
                  Close
                </button>
              </div>

              <div className="py-4">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${selectedQrCodeRef}`}
                  alt="Entry Ticket QR"
                  className="w-48 h-48 mx-auto border-4 border-gray-100 dark:border-slate-600 rounded-lg shadow-sm"
                />
                <p className="mt-4 font-mono font-bold text-gray-800 dark:text-gray-100 text-sm">{selectedQrCodeRef}</p>
                <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">Scan this code at the venue gate for entry confirmation.</p>
              </div>

              <a
                href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${selectedQrCodeRef}`}
                target="_blank"
                rel="noreferrer"
                download={`ticket-${selectedQrCodeRef}.png`}
                className="inline-block w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Download Ticket Pass (Large Image)
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
