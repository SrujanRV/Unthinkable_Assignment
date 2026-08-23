import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Search, Calendar, MapPin, ArrowRight, Loader } from 'lucide-react';
import SeatMap from './SeatMap';

interface Venue {
  id: string;
  name: string;
  location: string;
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
  venue: Venue;
  showPrices: ShowPrice[];
}

interface Event {
  id: string;
  title: string;
  description: string;
  type: 'MOVIE' | 'CONCERT';
  shows: Show[];
}

export default function BrowseEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [venueFilter, setVenueFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('');

  const { selectedShow, setSelectedShow } = useAuth();

  const fetchEventsAndVenues = async () => {
    setLoading(true);
    try {
      const [eventsRes, venuesRes] = await Promise.all([
        axios.get<{ events: Event[] }>('/api/events'),
        axios.get<{ venues: Venue[] }>('/api/venues'),
      ]);
      setEvents(eventsRes.data.events);
      setVenues(venuesRes.data.venues);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to fetch events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEventsAndVenues();

    // Intercept waitlist claims tokens from email redirects
    const params = new URLSearchParams(window.location.search);
    const claimToken = params.get('claimToken');
    if (claimToken) {
      try {
        const payloadBase64 = claimToken.split('.')[1];
        const payloadJson = atob(payloadBase64);
        const payload = JSON.parse(payloadJson);
        const { showId } = payload;

        if (showId) {
          console.log('[Waitlist Claim] Automatically opening show:', showId);
          setSelectedShow({
            showId,
            eventId: '',
            venueName: 'Your Waitlist Offer',
          });
        }
      } catch (err) {
        console.error('Failed to parse claimToken:', err);
      }
    }
  }, []);

  // Filter listings based on criteria
  const filteredEvents = events.filter((event) => {
    // 1. Keyword search match (Title or Description)
    const matchesKeyword =
      event.title.toLowerCase().includes(search.toLowerCase()) ||
      event.description.toLowerCase().includes(search.toLowerCase());

    // 2. Event Type Match
    const matchesType = typeFilter === 'ALL' || event.type === typeFilter;

    // 3. Filter shows inside the event based on venue and date
    const matchingShows = event.shows.filter((show) => {
      const matchesVenue = venueFilter === 'ALL' || show.venueId === venueFilter;

      let matchesDate = true;
      if (dateFilter) {
        const showDateStr = new Date(show.startTime).toISOString().split('T')[0];
        matchesDate = showDateStr === dateFilter;
      }

      return matchesVenue && matchesDate;
    });

    // Event must match type and keyword, and contain at least one show matching venue/date filters
    return matchesKeyword && matchesType && matchingShows.length > 0;
  });

  if (selectedShow) {
    return (
      <SeatMap
        showId={selectedShow.showId}
        eventId={selectedShow.eventId}
        venueName={selectedShow.venueName}
        onBack={() => {
          setSelectedShow(null);
          fetchEventsAndVenues(); // Refresh seat availability counts on return
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtering Header panel */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          🔍 Browse Movies &amp; Concerts
        </h2>

        {/* Filter controls grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Keyword Search */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
              placeholder="Search by keywords..."
            />
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs bg-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            <option value="CONCERT">Concerts</option>
            <option value="MOVIE">Movies</option>
          </select>

          {/* Venue Filter */}
          <select
            value={venueFilter}
            onChange={(e) => setVenueFilter(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs bg-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Venues</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>

          {/* Date Filter */}
          <div className="relative">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* Events Grid */}
      {loading ? (
        <div className="py-12 text-center">
          <Loader className="w-10 h-10 animate-spin text-indigo-600 mx-auto" />
          <p className="mt-2 text-sm text-gray-500">Browsing events...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="p-8 text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
          No matches found for your filter criteria. Try resetting filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredEvents.map((event) => (
            <div
              key={event.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col justify-between"
            >
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-gray-800">{event.title}</span>
                  <span className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold px-1.5 py-0.5 rounded uppercase">
                    {event.type}
                  </span>
                </div>
                <p className="text-sm text-gray-500 line-clamp-3">{event.description}</p>
              </div>

              {/* Show times container */}
              <div className="px-5 pb-5 pt-3 border-t border-gray-100 bg-gray-50/50 space-y-3">
                <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Available Showtimes:
                </span>
                <div className="space-y-2">
                  {event.shows
                    .filter((show) => {
                      const matchesVenue = venueFilter === 'ALL' || show.venueId === venueFilter;
                      let matchesDate = true;
                      if (dateFilter) {
                        const showDateStr = new Date(show.startTime).toISOString().split('T')[0];
                        matchesDate = showDateStr === dateFilter;
                      }
                      return matchesVenue && matchesDate;
                    })
                    .map((show) => (
                      <div
                        key={show.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-white border border-gray-200 rounded-lg text-xs gap-3 hover:border-indigo-400 hover:shadow-sm transition-all"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-gray-700 font-bold">
                            <Calendar className="w-4.5 h-4.5 text-indigo-500" />
                            <span>{new Date(show.startTime).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <MapPin className="w-4 h-4 text-indigo-400" />
                            <span>
                              {show.venue.name} ({show.venue.location})
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            setSelectedShow({
                              showId: show.id,
                              eventId: event.id,
                              venueName: show.venue.name,
                            })
                          }
                          className="flex items-center justify-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold uppercase transition-colors"
                        >
                          Select Seats
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
