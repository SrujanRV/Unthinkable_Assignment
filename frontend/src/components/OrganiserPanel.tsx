import { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Edit3, Calendar, MapPin, Layers, DollarSign, Save, Loader, BarChart3, Users, Landmark, AlertTriangle, XCircle } from 'lucide-react';

interface SeatCategory {
  id: string;
  name: string;
  priceMultiplier: number;
}

interface Venue {
  id: string;
  name: string;
  location: string;
  seatCategories: SeatCategory[];
}

interface ShowPrice {
  id: string;
  price: string;
  seatCategoryId: string;
  category: {
    name: string;
  };
}

interface Show {
  id: string;
  startTime: string;
  venueId: string;
  venue: {
    name: string;
    location: string;
  };
  showPrices: ShowPrice[];
  _count: {
    showSeats: number;
  };
}

interface OrganiserEvent {
  id: string;
  title: string;
  description: string;
  type: 'MOVIE' | 'CONCERT';
  posterUrl?: string;
  isCancelled: boolean;
  shows: Show[];
}

export default function OrganiserPanel() {
  const [panelMode, setPanelMode] = useState<'listings' | 'metrics'>('listings');
  const [events, setEvents] = useState<OrganiserEvent[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<OrganiserEvent | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [isEditingEvent, setIsEditingEvent] = useState(false);

  // Metrics Dashboard State
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'MOVIE' | 'CONCERT'>('CONCERT');
  const [posterUrl, setPosterUrl] = useState('');
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [categoryPrices, setCategoryPrices] = useState<{ [catId: string]: string }>({});
  const [basePrice, setBasePrice] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Event Cancellation State
  const [cancelConfirmEventId, setCancelConfirmEventId] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const fetchMyEvents = async () => {
    try {
      const res = await axios.get<{ events: OrganiserEvent[] }>('/api/organiser/events');
      setEvents(res.data.events);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to fetch your events');
    }
  };

  const fetchVenues = async () => {
    try {
      const res = await axios.get<{ venues: Venue[] }>('/api/venues');
      setVenues(res.data.venues);
    } catch (err: any) {
      console.error('Error fetching venues:', err);
    }
  };

  const fetchMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const res = await axios.get<{ metrics: any[] }>('/api/organiser/metrics');
      setMetrics(res.data.metrics);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to fetch sales metrics');
    } finally {
      setLoadingMetrics(false);
    }
  };

  useEffect(() => {
    fetchVenues();
    fetchMyEvents();
  }, []);

  useEffect(() => {
    if (panelMode === 'metrics') {
      fetchMetrics();
    } else {
      fetchMyEvents();
    }
  }, [panelMode]);

  // Handle auto-populating pricing based on multipliers
  const handleBasePriceChange = (val: string) => {
    setBasePrice(val);
    const numericBase = parseFloat(val);
    if (isNaN(numericBase)) return;

    const selectedVenue = venues.find((v) => v.id === selectedVenueId);
    if (!selectedVenue) return;

    const prices: { [catId: string]: string } = {};
    selectedVenue.seatCategories.forEach((cat) => {
      const catPrice = (numericBase * Number(cat.priceMultiplier)).toFixed(2);
      prices[cat.id] = catPrice;
    });
    setCategoryPrices(prices);
  };

  const handleVenueChange = (venueId: string) => {
    setSelectedVenueId(venueId);
    setBasePrice('');
    setCategoryPrices({});
  };

  const setIsCreatingVenueFormEmpty = () => {
    setTitle('');
    setDescription('');
    setType('CONCERT');
    setPosterUrl('');
    setSelectedVenueId('');
    setStartTime('');
    setCategoryPrices({});
    setBasePrice('');
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const pricesPayload = Object.keys(categoryPrices).map((catId) => ({
      seatCategoryId: catId,
      price: parseFloat(categoryPrices[catId]),
    }));

    try {
      await axios.post('/api/organiser/events', {
        title,
        description,
        type,
        posterUrl: posterUrl.trim() || undefined,
        venueId: selectedVenueId,
        startTime: new Date(startTime).toISOString(),
        prices: pricesPayload,
      });

      setSuccess('Event listing created successfully!');
      setIsCreatingEvent(false);
      setIsCreatingVenueFormEmpty();
      fetchMyEvents();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create listing');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (event: OrganiserEvent) => {
    setSelectedEvent(event);
    setTitle(event.title);
    setDescription(event.description);
    setType(event.type);
    setPosterUrl(event.posterUrl || '');

    const show = event.shows[0];
    if (show) {
      const localTime = new Date(show.startTime).toISOString().slice(0, 16);
      setStartTime(localTime);

      const prices: { [catId: string]: string } = {};
      show.showPrices.forEach((sp) => {
        prices[sp.seatCategoryId] = Number(sp.price).toFixed(2);
      });
      setCategoryPrices(prices);
    }
    setIsEditingEvent(true);
  };

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    const show = selectedEvent.shows[0];
    const pricesPayload = Object.keys(categoryPrices).map((catId) => ({
      seatCategoryId: catId,
      price: parseFloat(categoryPrices[catId]),
    }));

    try {
      await axios.put(`/api/organiser/events/${selectedEvent.id}`, {
        title,
        description,
        type,
        posterUrl: posterUrl.trim() || undefined,
        showId: show?.id,
        startTime: new Date(startTime).toISOString(),
        prices: pricesPayload,
      });

      setSuccess('Listing details updated successfully!');
      setIsEditingEvent(false);
      setSelectedEvent(null);
      setIsCreatingVenueFormEmpty();
      fetchMyEvents();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to update listing');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEvent = async (eventId: string) => {
    setCancelLoading(true);
    setError(null);
    try {
      await axios.post(`/api/organiser/events/${eventId}/cancel`);
      setSuccess('Event cancelled. All bookings have been cancelled and customers notified.');
      setCancelConfirmEventId(null);
      fetchMyEvents();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to cancel event');
      setCancelConfirmEventId(null);
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header Banner */}
      <div className="bg-indigo-950 px-6 py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">🎸 Organiser Hub</h2>
          <p className="text-xs text-indigo-200">Schedule listings, override pricing, and track booking sales metrics</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPanelMode('listings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors focus:outline-none ${
              panelMode === 'listings' && !isCreatingEvent && !isEditingEvent
                ? 'bg-white text-indigo-950 shadow-sm'
                : 'text-white hover:bg-white/10'
            }`}
          >
            Manage Listings
          </button>
          <button
            onClick={() => {
              setIsCreatingEvent(false);
              setIsEditingEvent(false);
              setPanelMode('metrics');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors focus:outline-none ${
              panelMode === 'metrics'
                ? 'bg-white text-indigo-950 shadow-sm'
                : 'text-white hover:bg-white/10'
            }`}
          >
            Sales Dashboard
          </button>
        </div>
      </div>

      <div className="p-6">
        {success && (
          <div className="p-4 mb-4 text-sm text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-250">
            {success}
          </div>
        )}
        {error && (
          <div className="p-4 mb-4 text-sm text-red-700 bg-red-50 rounded-lg border border-red-250">
            {error}
          </div>
        )}

        {/* SECTION 1: Listings Management */}
        {panelMode === 'listings' && !isCreatingEvent && !isEditingEvent && (
          <div className="space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-gray-150">
              <h3 className="text-lg font-bold text-gray-800">Scheduled Shows</h3>
              <button
                onClick={() => setIsCreatingEvent(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow transition-colors"
              >
                <Plus className="w-4 h-4" />
                Schedule Event
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {events.length === 0 ? (
                <div className="py-12 text-center text-gray-400 border border-dashed rounded-xl">
                  You have not listed any shows yet. Click &apos;Schedule Event&apos; to register one.
                </div>
              ) : (
                events.map((event) => (
                  <div
                    key={event.id}
                    className={`p-5 border rounded-xl transition-all flex flex-col md:flex-row justify-between gap-4 ${
                      event.isCancelled
                        ? 'border-red-200 bg-red-50/40 opacity-70'
                        : 'border-gray-250 hover:border-gray-350 hover:shadow-sm'
                    }`}
                  >
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-extrabold text-gray-850">{event.title}</span>
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded uppercase border border-indigo-200">
                          {event.type}
                        </span>
                        {event.isCancelled && (
                          <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded uppercase border border-red-300 flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            Cancelled
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2 max-w-2xl">
                        {event.description}
                      </p>

                      {event.shows.map((show) => (
                        <div key={show.id} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-450 font-medium">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                            <span>{new Date(show.startTime).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                            <span>
                              {show.venue.name} ({show.venue.location})
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Layers className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                            <span>{show._count.showSeats} Seats Initialized</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2 items-end justify-between self-end md:self-center">
                      <div className="flex flex-wrap gap-1 text-[10px] font-bold text-gray-600">
                        {event.shows[0]?.showPrices.map((sp) => (
                          <span
                            key={sp.id}
                            className="bg-gray-50 border border-gray-200 px-2 py-0.5 rounded"
                          >
                            {sp.category.name}: ${Number(sp.price).toFixed(2)}
                          </span>
                        ))}
                      </div>

                      {!event.isCancelled && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditClick(event)}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors focus:outline-none"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit Details
                          </button>
                          {cancelConfirmEventId === event.id ? (
                            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                              <span className="text-xs text-red-700 font-semibold">Confirm cancel?</span>
                              <button
                                onClick={() => handleCancelEvent(event.id)}
                                disabled={cancelLoading}
                                className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                              >
                                {cancelLoading ? 'Cancelling...' : 'Yes, Cancel'}
                              </button>
                              <button
                                onClick={() => setCancelConfirmEventId(null)}
                                className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setError(null); setSuccess(null); setCancelConfirmEventId(event.id); }}
                              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition-colors focus:outline-none"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Cancel Event
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SECTION 2: Sales Metrics Dashboard Tab */}
        {panelMode === 'metrics' && (
          <div className="space-y-6">
            {loadingMetrics ? (
              <div className="py-12 text-center">
                <Loader className="w-10 h-10 animate-spin text-indigo-655 mx-auto" />
                <p className="mt-2 text-xs text-gray-500">Compiling event revenue metrics...</p>
              </div>
            ) : metrics.length === 0 ? (
              <div className="py-12 text-center text-gray-400 border border-dashed rounded-xl">
                No events listed yet. Switch back to the listings tab to register shows!
              </div>
            ) : (
              <div className="space-y-8">
                {/* Summary Widgets */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-indigo-50 border border-indigo-150 rounded-xl flex items-center gap-4">
                    <Landmark className="w-8 h-8 text-indigo-600" />
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-indigo-500 tracking-wider">Active Shows</span>
                      <span className="text-xl font-black text-indigo-950">{metrics.length}</span>
                    </div>
                  </div>
                  <div className="p-4 bg-emerald-50 border border-emerald-150 rounded-xl flex items-center gap-4">
                    <Users className="w-8 h-8 text-emerald-600" />
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-emerald-500 tracking-wider">Tickets Booked</span>
                      <span className="text-xl font-black text-emerald-950">
                        {metrics.reduce((acc, curr) => acc + curr.shows.reduce((sAcc: number, sCurr: any) => sAcc + sCurr.bookedSeats, 0), 0)}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 bg-amber-50 border border-amber-150 rounded-xl flex items-center gap-4">
                    <BarChart3 className="w-8 h-8 text-amber-600" />
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-amber-500 tracking-wider">Gross Revenue</span>
                      <span className="text-xl font-black text-amber-950">
                        ${metrics.reduce((acc, curr) => acc + curr.shows.reduce((sAcc: number, sCurr: any) => sAcc + sCurr.revenue, 0), 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Per Event Shows Metrics Card */}
                {metrics.map((event) => (
                  <div key={event.eventId} className="bg-white border border-gray-250 rounded-2xl overflow-hidden shadow-sm">
                    <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-extrabold text-gray-800 text-sm">{event.title}</h3>
                          <span className="text-[9px] bg-indigo-100 text-indigo-850 font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">
                            {event.type}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 space-y-6">
                      {event.shows.map((show: any) => {
                        const percentFilled = show.totalSeats > 0 ? (show.bookedSeats / show.totalSeats) * 100 : 0;

                        // Group timeline points by date
                        const dailyBookingsMap: { [date: string]: { count: number; revenue: number } } = {};
                        show.timeline.forEach((point: any) => {
                          const dateStr = new Date(point.date).toLocaleDateString();
                          if (!dailyBookingsMap[dateStr]) {
                            dailyBookingsMap[dateStr] = { count: 0, revenue: 0 };
                          }
                          dailyBookingsMap[dateStr].count += point.ticketsCount;
                          dailyBookingsMap[dateStr].revenue += point.amount;
                        });

                        const dailyTimeline = Object.keys(dailyBookingsMap).map((date) => ({
                          date,
                          ...dailyBookingsMap[date],
                        }));

                        const maxDailySales = Math.max(1, ...dailyTimeline.map((d) => d.count));

                        return (
                          <div key={show.id} className="space-y-4 pb-6 border-b border-gray-150 last:border-b-0 last:pb-0">
                            {/* Meta Metrics Bar */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-150 text-xs">
                              <div>
                                <span className="block text-[9px] text-gray-400 font-bold uppercase">Showtime</span>
                                <span className="font-bold text-gray-700">{new Date(show.startTime).toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="block text-[9px] text-gray-400 font-bold uppercase">Venue</span>
                                <span className="font-bold text-gray-700">{show.venueName}</span>
                              </div>
                              <div>
                                <span className="block text-[9px] text-gray-400 font-bold uppercase">Seating Fill Rate</span>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-650 rounded-full" style={{ width: `${percentFilled}%` }} />
                                  </div>
                                  <span className="font-mono font-bold text-[10px] whitespace-nowrap">
                                    {show.bookedSeats}/{show.totalSeats} ({percentFilled.toFixed(0)}%)
                                  </span>
                                </div>
                              </div>
                              <div>
                                <span className="block text-[9px] text-gray-400 font-bold uppercase">Revenue Earned</span>
                                <span className="font-black text-emerald-650 text-sm mt-0.5 block">${show.revenue.toFixed(2)}</span>
                              </div>
                            </div>

                            {/* Booking Timeline Simple Table / Visual Chart */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Booking List Table */}
                              <div>
                                <h4 className="font-bold text-gray-700 text-xs mb-2">Bookings History</h4>
                                {show.timeline.length === 0 ? (
                                  <div className="py-12 text-center text-xs text-gray-400 bg-gray-50 border border-dashed rounded-lg">
                                    No ticket purchases logged yet.
                                  </div>
                                ) : (
                                  <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg">
                                    <table className="min-w-full divide-y divide-gray-255 text-left text-xs">
                                      <thead className="bg-gray-105 text-[10px] text-gray-500 font-bold uppercase">
                                        <tr>
                                          <th className="px-3 py-2">Date/Time</th>
                                          <th className="px-3 py-2 text-center">Tickets</th>
                                          <th className="px-3 py-2 text-right">Paid</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200 text-gray-750">
                                        {show.timeline.map((item: any, idx: number) => (
                                          <tr key={idx} className="hover:bg-gray-50/50">
                                            <td className="px-3 py-2 whitespace-nowrap">{new Date(item.date).toLocaleString()}</td>
                                            <td className="px-3 py-2 text-center font-bold">{item.ticketsCount}</td>
                                            <td className="px-3 py-2 text-right text-emerald-600 font-bold">${item.amount.toFixed(2)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>

                              {/* Sales Daily Visual Column Chart */}
                              <div>
                                <h4 className="font-bold text-gray-700 text-xs mb-2">Daily Tickets Sold Trend</h4>
                                {dailyTimeline.length === 0 ? (
                                  <div className="py-12 text-center text-xs text-gray-400 bg-gray-50 border border-dashed rounded-lg">
                                    No sales history to visualize.
                                  </div>
                                ) : (
                                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 flex flex-col justify-between h-56">
                                    {/* Chart Bars */}
                                    <div className="flex-1 flex items-end gap-3 pb-2 pt-4">
                                      {dailyTimeline.map((day: any, idx: number) => {
                                        const barHeightPercent = (day.count / maxDailySales) * 100;
                                        return (
                                          <div key={idx} className="flex-1 flex flex-col items-center group relative cursor-pointer">
                                            {/* Hover Tooltip */}
                                            <div className="absolute bottom-full mb-1.5 hidden group-hover:block bg-gray-800 text-white text-[9px] font-bold py-1 px-2 rounded shadow-lg whitespace-nowrap z-10">
                                              <span>{day.date}</span>
                                              <span className="block text-indigo-300">{day.count} tickets sold</span>
                                              <span className="block text-emerald-300">${day.revenue.toFixed(2)} revenue</span>
                                            </div>
                                            {/* Bar */}
                                            <div
                                              className="w-full bg-indigo-600 hover:bg-indigo-700 rounded-t-md transition-all shadow-sm"
                                              style={{ height: `${Math.max(12, barHeightPercent)}%` }}
                                            />
                                            {/* Bar Label (Ticket Count) */}
                                            <span className="text-[9px] font-bold text-gray-700 mt-1">{day.count}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {/* X-Axis labels */}
                                    <div className="border-t border-gray-200 pt-1.5 flex justify-between text-[9px] text-gray-400 font-bold">
                                      <span>{dailyTimeline[0]?.date}</span>
                                      <span>{dailyTimeline[dailyTimeline.length - 1]?.date}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: Create Event Form */}
        {panelMode === 'listings' && isCreatingEvent && (
          <form onSubmit={handleCreateEvent} className="space-y-6 max-w-2xl">
            <h3 className="text-lg font-bold text-gray-800 pb-2 border-b border-gray-100">
              Create Event Listing
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase">Event Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="e.g. Taylor Swift Eras Concert Tour"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase">Event Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Provide event overview, guidelines, etc."
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase">Poster Image URL (Optional)</label>
                <input
                  type="url"
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="https://images.unsplash.com/photo-..."
                />
                {posterUrl && (
                  <div className="mt-2.5 p-2 border border-gray-200 rounded-lg bg-gray-50 flex items-center gap-3">
                    <img
                      src={posterUrl}
                      alt="Poster Preview"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                      className="w-24 aspect-video object-cover rounded border border-gray-300 shadow-xs"
                    />
                    <span className="text-xs text-gray-500 font-medium">Live Poster Preview</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">Event Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as 'MOVIE' | 'CONCERT')}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="CONCERT">Concert</option>
                  <option value="MOVIE">Movie</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">Venue</label>
                <select
                  value={selectedVenueId}
                  onChange={(e) => handleVenueChange(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white"
                  required
                >
                  <option value="">-- Select a Venue --</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.location})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">Showtime Date &amp; Time</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  required
                />
              </div>

              {selectedVenueId && (
                <div className="md:col-span-2 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
                  <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                    <DollarSign className="w-4.5 h-4.5 text-indigo-500" />
                    Seat Category Pricing
                  </h4>

                  {/* Base Pricing Helper */}
                  <div>
                    <label className="block text-xs text-gray-500 font-semibold">
                      Base Price Helper ($)
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={basePrice}
                      onChange={(e) => handleBasePriceChange(e.target.value)}
                      placeholder="e.g. 100.00 (calculates other categories using multipliers)"
                      className="mt-1 block w-full max-w-xs rounded border border-gray-300 px-3 py-1.5 text-xs"
                    />
                  </div>

                  {/* Individual Categories inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {venues
                      .find((v) => v.id === selectedVenueId)
                      ?.seatCategories.map((cat) => (
                        <div key={cat.id}>
                          <label className="block text-xs font-semibold text-gray-600">
                            {cat.name} Price (Multiplier: {Number(cat.priceMultiplier).toFixed(1)}x)
                          </label>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={categoryPrices[cat.id] || ''}
                            onChange={(e) =>
                              setCategoryPrices({ ...categoryPrices, [cat.id]: e.target.value })
                            }
                            placeholder="Price in $"
                            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-xs"
                            required
                          />
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setIsCreatingEvent(false);
                  setIsCreatingVenueFormEmpty();
                }}
                className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-1.5 px-6 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Create Event Listing
              </button>
            </div>
          </form>
        )}

        {/* SECTION 4: Edit Event Form */}
        {panelMode === 'listings' && isEditingEvent && selectedEvent && (
          <form onSubmit={handleUpdateEvent} className="space-y-6 max-w-2xl">
            <h3 className="text-lg font-bold text-gray-800 pb-2 border-b border-gray-100">
              Edit Event Listing: {selectedEvent.title}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase">Event Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase">Poster Image URL (Optional)</label>
                <input
                  type="url"
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="https://images.unsplash.com/photo-..."
                />
                {posterUrl && (
                  <div className="mt-2.5 p-2 border border-gray-200 rounded-lg bg-gray-50 flex items-center gap-3">
                    <img
                      src={posterUrl}
                      alt="Poster Preview"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                      className="w-24 aspect-video object-cover rounded border border-gray-300 shadow-xs"
                    />
                    <span className="text-xs text-gray-500 font-medium">Live Poster Preview</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">Event Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as 'MOVIE' | 'CONCERT')}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="CONCERT">Concert</option>
                  <option value="MOVIE">Movie</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">Showtime Date &amp; Time</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  required
                />
              </div>

              {selectedEvent.shows[0] && (
                <div className="md:col-span-2 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
                  <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1.5 mb-2">
                    <DollarSign className="w-4.5 h-4.5 text-indigo-500" />
                    Seat Category Pricing
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedEvent.shows[0].showPrices.map((sp) => (
                      <div key={sp.seatCategoryId}>
                        <label className="block text-xs font-semibold text-gray-600">
                          {sp.category.name} Price ($)
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={categoryPrices[sp.seatCategoryId] || ''}
                          onChange={(e) =>
                              setCategoryPrices({
                                ...categoryPrices,
                                [sp.seatCategoryId]: e.target.value,
                              })
                          }
                          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-xs"
                          required
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setIsEditingEvent(false);
                  setSelectedEvent(null);
                  setIsCreatingVenueFormEmpty();
                }}
                className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-1.5 px-6 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
