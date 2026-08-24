import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Search, Calendar, MapPin, ArrowRight, Loader, Film, Music2, Filter } from 'lucide-react';
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

  const typeConfig = {
    MOVIE: {
      icon: Film,
      gradient: 'from-slate-700 to-slate-900',
      btn: 'bg-slate-700 hover:bg-slate-800',
    },
    CONCERT: {
      icon: Music2,
      gradient: 'from-indigo-700 to-violet-900',
      btn: 'bg-indigo-600 hover:bg-indigo-700',
    },
  };

  const inputCls =
    'block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 ' +
    'focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all ' +
    'dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100 dark:placeholder-slate-400 ' +
    'dark:focus:border-indigo-500 dark:focus:bg-slate-600';

  return (
    <div className="space-y-6">
      {/* Filtering Header panel */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm transition-colors">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-gray-400 dark:text-slate-500" />
          <h2 className="text-sm font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider">
            Browse Movies &amp; Concerts
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Keyword Search */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 dark:text-slate-500 pointer-events-none">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`pl-9 ${inputCls}`}
              placeholder="Search events..."
            />
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={inputCls}
          >
            <option value="ALL">All Categories</option>
            <option value="CONCERT">🎵 Concerts</option>
            <option value="MOVIE">🎬 Movies</option>
          </select>

          {/* Venue Filter */}
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

          {/* Date Filter */}
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {error && (
        <div className="p-4 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {/* Events Grid */}
      {loading ? (
        <div className="py-16 text-center">
          <Loader className="w-10 h-10 animate-spin text-indigo-500 mx-auto" />
          <p className="mt-3 text-sm text-gray-500 dark:text-slate-400">Finding events for you...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="py-16 text-center text-gray-400 dark:text-slate-500 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-2xl">
          <p className="text-base font-semibold">No events match your search</p>
          <p className="text-sm mt-1">Try adjusting your filters or search term</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredEvents.map((event) => {
            const cfg = typeConfig[event.type];
            const TypeIcon = cfg.icon;

            return (
              <div
                key={event.id}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                {/* Card header stripe — gradients are already dark, look great in both modes */}
                <div className={`bg-gradient-to-r ${cfg.gradient} px-5 py-4 flex items-start gap-3`}>
                  <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <TypeIcon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-white leading-tight">{event.title}</h3>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white uppercase tracking-wide">
                        {event.type}
                      </span>
                    </div>
                    <p className="text-sm text-white/75 mt-0.5 line-clamp-2">{event.description}</p>
                  </div>
                </div>

                {/* Showtimes */}
                <div className="px-5 py-4 flex-1 space-y-3 bg-gray-50/40 dark:bg-slate-800/60">
                  <span className="block text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">
                    Available Showtimes
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
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-sm gap-3 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-sm transition-all duration-150 group"
                        >
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-gray-800 dark:text-gray-100 font-semibold">
                              <Calendar className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                              <span className="text-sm">{new Date(show.startTime).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 text-xs">
                              <MapPin className="w-3.5 h-3.5 text-indigo-300 flex-shrink-0" />
                              <span>{show.venue.name} &middot; {show.venue.location}</span>
                            </div>
                            {show.showPrices.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {show.showPrices.map((sp) => (
                                  <span
                                    key={sp.id}
                                    className="text-[10px] font-bold bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-slate-300 px-2 py-0.5 rounded-full"
                                  >
                                    {sp.category.name} · ${Number(sp.price).toFixed(2)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() =>
                              setSelectedShow({
                                showId: show.id,
                                eventId: event.id,
                                venueName: show.venue.name,
                              })
                            }
                            className={`flex items-center justify-center gap-1.5 px-4 py-2 ${cfg.btn} text-white rounded-lg text-xs font-bold transition-all duration-150 shadow-sm group-hover:shadow-md whitespace-nowrap`}
                          >
                            Select Seats
                            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
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
