import { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Edit3, Calendar, MapPin, Layers, DollarSign, Save, Loader, ArrowLeft } from 'lucide-react';

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
  shows: Show[];
}

export default function OrganiserPanel() {
  const [events, setEvents] = useState<OrganiserEvent[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<OrganiserEvent | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [isEditingEvent, setIsEditingEvent] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'MOVIE' | 'CONCERT'>('CONCERT');
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [categoryPrices, setCategoryPrices] = useState<{ [catId: string]: string }>({});
  const [basePrice, setBasePrice] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  useEffect(() => {
    fetchMyEvents();
    fetchVenues();
  }, []);

  // Handle auto-populating pricing based on multipliers
  const handleBasePriceChange = (val: string) => {
    setBasePrice(val);
    const numericBase = parseFloat(val);
    if (isNaN(numericBase)) return;

    const selectedVenue = venues.find((v) => v.id === selectedVenueId);
    if (!selectedVenue) return;

    const autoPrices: { [catId: string]: string } = {};
    selectedVenue.seatCategories.forEach((cat) => {
      const finalPrice = numericBase * Number(cat.priceMultiplier);
      autoPrices[cat.id] = finalPrice.toFixed(2);
    });
    setCategoryPrices(autoPrices);
  };

  const handleVenueChange = (venueId: string) => {
    setSelectedVenueId(venueId);
    setBasePrice('');
    setCategoryPrices({});
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !selectedVenueId || !startTime) {
      setError('Please fill in all fields');
      return;
    }

    const priceList = Object.keys(categoryPrices).map((catId) => ({
      seatCategoryId: catId,
      price: parseFloat(categoryPrices[catId]),
    }));

    if (priceList.some((p) => isNaN(p.price) || p.price <= 0)) {
      setError('Please assign a valid positive price to all seat categories');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await axios.post('/api/organiser/events', {
        title,
        description,
        type,
        venueId: selectedVenueId,
        startTime: new Date(startTime).toISOString(),
        prices: priceList,
      });

      setSuccess('Event and showtime listing created successfully!');
      setIsCreatingVenueFormEmpty();
      setIsCreatingEvent(false);
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

    const mainShow = event.shows[0];
    if (mainShow) {
      setStartTime(new Date(mainShow.startTime).toISOString().slice(0, 16));
      const prices: { [catId: string]: string } = {};
      mainShow.showPrices.forEach((sp) => {
        prices[sp.seatCategoryId] = Number(sp.price).toFixed(2);
      });
      setCategoryPrices(prices);
    }
    setIsEditingEvent(true);
  };

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;

    const mainShow = selectedEvent.shows[0];
    const priceList = mainShow
      ? Object.keys(categoryPrices).map((catId) => ({
          seatCategoryId: catId,
          price: parseFloat(categoryPrices[catId]),
        }))
      : [];

    setLoading(true);
    setError(null);
    try {
      await axios.put(`/api/organiser/events/${selectedEvent.id}`, {
        title,
        description,
        type,
        showId: mainShow?.id,
        startTime: startTime ? new Date(startTime).toISOString() : undefined,
        prices: priceList,
      });

      setSuccess('Event listing updated successfully!');
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

  const setIsCreatingVenueFormEmpty = () => {
    setTitle('');
    setDescription('');
    setSelectedVenueId('');
    setStartTime('');
    setCategoryPrices({});
    setBasePrice('');
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header Banner */}
      <div className="bg-indigo-900 px-6 py-4 text-white flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">🎸 Event Organiser Dashboard</h2>
          <p className="text-xs text-indigo-200">List events, schedule showtimes and set ticket pricing</p>
        </div>
        {(isCreatingEvent || isEditingEvent) && (
          <button
            onClick={() => {
              setIsCreatingEvent(false);
              setIsEditingEvent(false);
              setSelectedEvent(null);
              setIsCreatingVenueFormEmpty();
            }}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-indigo-800 hover:bg-indigo-700 rounded-md border border-indigo-700 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to My Events
          </button>
        )}
      </div>

      <div className="p-6">
        {/* Messages */}
        {error && (
          <div className="p-4 mb-4 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">
            {error}
          </div>
        )}
        {success && (
          <div className="p-4 mb-4 text-sm text-green-700 bg-green-50 rounded-lg border border-green-200">
            {success}
          </div>
        )}

        {/* SECTION 1: Event List */}
        {!isCreatingEvent && !isEditingEvent && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800">My Hosted Listings</h3>
              <button
                onClick={() => setIsCreatingEvent(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create New Event
              </button>
            </div>

            <div className="space-y-4">
              {events.length === 0 ? (
                <div className="p-8 text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                  You haven&apos;t hosted any events yet. Click &quot;Create New Event&quot; to list a concert or movie!
                </div>
              ) : (
                events.map((event) => (
                  <div
                    key={event.id}
                    className="p-5 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-gray-800">{event.title}</span>
                        <span className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold px-1.5 py-0.5 rounded uppercase">
                          {event.type}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-2 max-w-xl">
                        {event.description}
                      </p>

                      {event.shows.map((show) => (
                        <div
                          key={show.id}
                          className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs text-gray-500"
                        >
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
                            className="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded"
                          >
                            {sp.category.name}: ${Number(sp.price).toFixed(2)}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => handleEditClick(event)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit Details
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SECTION 2: Create Event Form */}
        {isCreatingEvent && (
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
                <label className="block text-xs font-semibold text-gray-500 uppercase">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Provide event overview, guidelines, etc."
                  required
                />
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

        {/* SECTION 3: Edit Event Form */}
        {isEditingEvent && selectedEvent && (
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
