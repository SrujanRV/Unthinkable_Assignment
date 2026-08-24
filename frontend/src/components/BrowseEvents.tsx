import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Search, Calendar, MapPin, ArrowRight, Loader, Film, Music2 } from 'lucide-react';
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
  posterUrl?: string;
  shows: Show[];
}

const GRADIENT_PALETTES = [
  'from-indigo-900 via-purple-950 to-slate-950',
  'from-slate-800 via-slate-900 to-slate-950',
  'from-violet-900 via-indigo-950 to-slate-950',
  'from-blue-900 via-slate-900 to-slate-950',
  'from-emerald-900 via-teal-950 to-slate-950',
  'from-rose-900 via-slate-900 to-slate-950',
];

const getFallbackGradient = (title: string) => {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENT_PALETTES.length;
  return GRADIENT_PALETTES[index];
};

export default function BrowseEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedPosters, setFailedPosters] = useState<{ [eventId: string]: boolean }>({});

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
    const matchesKeyword =
      event.title.toLowerCase().includes(search.toLowerCase()) ||
      event.description.toLowerCase().includes(search.toLowerCase());

    const matchesType = typeFilter === 'ALL' || event.type === typeFilter;

    const matchingShows = event.shows.filter((show) => {
      const matchesVenue = venueFilter === 'ALL' || show.venueId === venueFilter;
      let matchesDate = true;
      if (dateFilter) {
        const showDateStr = new Date(show.startTime).toISOString().split('T')[0];
        matchesDate = showDateStr === dateFilter;
      }
      return matchesVenue && matchesDate;
    });

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
          fetchEventsAndVenues();
        }}
      />
    );
  }


  const inputCls =
    'block w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 ' +
    'focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all ' +
    'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 ' +
    'dark:focus:border-indigo-500 dark:focus:bg-slate-800';

  return (
    <div className="space-y-8">
      {/* Hero & Search Header */}
      <div className="bg-gradient-to-b from-indigo-950/5 via-slate-50 to-slate-50 dark:from-indigo-950/20 dark:via-slate-950 dark:to-slate-950 p-8 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-center space-y-6">
        <div className="max-w-2xl mx-auto space-y-2">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1 rounded-full border border-indigo-200/50 dark:border-indigo-800/50">
            High-Concurrency Ticket Booking
          </span>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight sm:text-4xl">
            Discover &amp; Book Live Experiences
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Real-time seat holds with Redis distributed locks, automated waitlists, and instant QR passes.
          </p>
        </div>

        {/* Integrated Filter Bar */}
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-4xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            {/* Search */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 dark:text-slate-500 pointer-events-none">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`pl-9.5 ${inputCls}`}
                placeholder="Search events..."
              />
            </div>

            {/* Type */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={inputCls}
            >
              <option value="ALL">All Categories</option>
              <option value="CONCERT">🎵 Concerts</option>
              <option value="MOVIE">🎬 Movies</option>
            </select>

            {/* Venue */}
            <select
              value={venueFilter}
              onChange={(e) => setVenueFilter(e.target.value)}
              className={inputCls}
            >
              <option value="ALL">All Venues</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>

            {/* Date */}
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-900/50">
          {error}
        </div>
      )}

      {/* Events Grid */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <Loader className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
          <p className="text-xs text-slate-500 dark:text-slate-400">Loading events and venues...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="py-20 text-center text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No matching events found</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Try clearing or adjusting your search filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredEvents.map((event) => {
            const isConcert = event.type === 'CONCERT';
            const EventIcon = isConcert ? Music2 : Film;

            // Calculate starting price
            let minPrice = Infinity;
            event.shows.forEach((s) => {
              s.showPrices.forEach((sp) => {
                const p = Number(sp.price);
                if (p < minPrice) minPrice = p;
              });
            });

            const hasPoster = Boolean(event.posterUrl) && !failedPosters[event.id];
            const fallbackGradient = getFallbackGradient(event.title);

            return (
              <div
                key={event.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 overflow-hidden flex flex-col hover:border-indigo-500/50 hover:shadow-md transition-all duration-200 group"
              >
                {/* Widescreen Poster / Banner */}
                <div className="aspect-video w-full p-6 flex flex-col justify-between relative overflow-hidden bg-slate-950 text-white">
                  {hasPoster ? (
                    <>
                      <img
                        src={event.posterUrl}
                        alt={event.title}
                        onError={() => setFailedPosters((prev) => ({ ...prev, [event.id]: true }))}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-slate-950/20" />
                    </>
                  ) : (
                    <div className={`absolute inset-0 bg-gradient-to-br ${fallbackGradient}`} />
                  )}

                  <div className="flex items-center justify-between z-10 relative">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-md bg-white/10 backdrop-blur-md border border-white/15 uppercase tracking-wider">
                      <EventIcon className="w-3 h-3 text-indigo-300" />
                      {event.type}
                    </span>
                    {minPrice !== Infinity && (
                      <span className="text-xs font-semibold bg-indigo-600 text-white px-2.5 py-1 rounded-md shadow-xs">
                        From ${minPrice.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 z-10 relative">
                    <h3 className="text-xl font-bold text-white tracking-tight leading-snug group-hover:text-indigo-200 transition-colors">
                      {event.title}
                    </h3>
                    <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                      {event.description}
                    </p>
                  </div>
                </div>

                {/* Showtimes List */}
                <div className="p-5 flex-1 space-y-3 bg-slate-50/50 dark:bg-slate-900/60">
                  <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Available Showtimes ({event.shows.length})
                  </span>
                  <div className="space-y-2.5">
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
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-lg text-sm gap-3 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all duration-150"
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 text-slate-900 dark:text-slate-100 font-semibold text-xs sm:text-sm">
                              <Calendar className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                              <span>{new Date(show.startTime).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              <span className="truncate">{show.venue.name} &middot; {show.venue.location}</span>
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
                            className="flex items-center justify-center gap-1 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs whitespace-nowrap self-end sm:self-center"
                          >
                            Select Seats
                            <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
