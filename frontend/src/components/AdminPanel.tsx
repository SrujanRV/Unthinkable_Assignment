import { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Save, MapPin, Grid, Layers, RefreshCw, Trash2, ArrowLeft } from 'lucide-react';

interface VenueCategory {
  id?: string;
  name: string;
  priceMultiplier: number;
}

interface VenueSeat {
  id?: string;
  row: string;
  number: number;
  categoryName: string;
}

interface VenueDetails {
  id: string;
  name: string;
  location: string;
  seatCategories: VenueCategory[];
  seats: VenueSeat[];
}

interface VenueListItem {
  id: string;
  name: string;
  location: string;
  _count: {
    seats: number;
    shows: number;
  };
}

export default function AdminPanel() {
  const [venues, setVenues] = useState<VenueListItem[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<VenueDetails | null>(null);
  const [isCreatingVenue, setIsCreatingVenue] = useState(false);
  const [venueName, setVenueName] = useState('');
  const [venueLocation, setVenueLocation] = useState('');

  // Layout Editor State
  const [rowsCount, setRowsCount] = useState<number>(5);
  const [colsCount, setColsCount] = useState<number>(10);
  const [categories, setCategories] = useState<VenueCategory[]>([
    { name: 'Standard', priceMultiplier: 1.0 },
    { name: 'Premium', priceMultiplier: 1.5 },
  ]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatMultiplier, setNewCatMultiplier] = useState<number>(1.0);
  const [activeCategoryName, setActiveCategoryName] = useState<string>('Standard');
  const [seatsGrid, setSeatsGrid] = useState<{ [key: string]: string }>({}); // "row-number": categoryName

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchVenues = async () => {
    try {
      const res = await axios.get<{ venues: VenueListItem[] }>('/api/admin/venues');
      setVenues(res.data.venues);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to fetch venues');
    }
  };

  useEffect(() => {
    fetchVenues();
  }, []);

  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venueName || !venueLocation) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<{ venue: VenueListItem }>('/api/admin/venues', {
        name: venueName,
        location: venueLocation,
      });
      setVenueName('');
      setVenueLocation('');
      setIsCreatingVenue(false);
      setSuccess('Venue created successfully! Select it to configure the seat layout.');
      fetchVenues();
      handleSelectVenue(res.data.venue.id);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create venue');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVenue = async (venueId: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await axios.get<{ venue: VenueDetails }>(`/api/admin/venues/${venueId}`);
      const venue = res.data.venue;
      setSelectedVenue(venue);

      // Load layout details into editor
      if (venue.seatCategories.length > 0) {
        setCategories(
          venue.seatCategories.map((c) => ({
            name: c.name,
            priceMultiplier: Number(c.priceMultiplier),
          })),
        );
        setActiveCategoryName(venue.seatCategories[0].name);
      } else {
        setCategories([
          { name: 'Standard', priceMultiplier: 1.0 },
          { name: 'Premium', priceMultiplier: 1.5 },
        ]);
        setActiveCategoryName('Standard');
      }

      // Populate grid from database seats
      const grid: { [key: string]: string } = {};
      let maxRow = 0;
      let maxNum = 0;

      venue.seats.forEach((seat) => {
        grid[`${seat.row}-${seat.number}`] = seat.categoryName;
        // Estimate dimensions
        const rowVal = seat.row.charCodeAt(0) - 64; // A=1, B=2
        if (rowVal > maxRow) maxRow = rowVal;
        if (seat.number > maxNum) maxNum = seat.number;
      });

      if (venue.seats.length > 0) {
        setRowsCount(maxRow || 5);
        setColsCount(maxNum || 10);
        setSeatsGrid(grid);
      } else {
        // Defaults if layout is empty
        setRowsCount(5);
        setColsCount(10);
        setSeatsGrid({});
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to fetch venue details');
    } finally {
      setLoading(false);
    }
  };

  // Layout calculations
  const getRowLabel = (index: number): string => {
    return String.fromCharCode(65 + index); // 0 -> 'A', 1 -> 'B', etc.
  };

  const handleGenerateGrid = () => {
    const grid: { [key: string]: string } = {};
    const defaultCat = categories[0]?.name || 'Standard';

    for (let r = 0; r < rowsCount; r++) {
      const rowLabel = getRowLabel(r);
      for (let c = 1; c <= colsCount; c++) {
        const key = `${rowLabel}-${c}`;
        // Preserve existing cell categories if applicable, otherwise default
        grid[key] = seatsGrid[key] || defaultCat;
      }
    }
    setSeatsGrid(grid);
    setSuccess('Grid layout generated! Click seats to paint them with the selected category.');
  };

  const handleSeatClick = (rowLabel: string, number: number) => {
    const key = `${rowLabel}-${number}`;
    setSeatsGrid((prev) => ({
      ...prev,
      [key]: activeCategoryName,
    }));
  };

  const handleAddCategory = () => {
    if (!newCatName) return;
    if (categories.some((c) => c.name.toLowerCase() === newCatName.toLowerCase())) {
      setError('Category with this name already exists.');
      return;
    }
    setCategories((prev) => [...prev, { name: newCatName, priceMultiplier: newCatMultiplier }]);
    setActiveCategoryName(newCatName);
    setNewCatName('');
    setNewCatMultiplier(1.0);
  };

  const handleRemoveCategory = (nameToRemove: string) => {
    if (categories.length <= 1) {
      setError('You must keep at least one seat category.');
      return;
    }
    setCategories((prev) => prev.filter((c) => c.name !== nameToRemove));
    if (activeCategoryName === nameToRemove) {
      setActiveCategoryName(categories.find((c) => c.name !== nameToRemove)?.name || '');
    }
    // Update grid seats pointing to this category to the remaining first category
    const remainingCat = categories.find((c) => c.name !== nameToRemove)?.name || 'Standard';
    const updatedGrid = { ...seatsGrid };
    Object.keys(updatedGrid).forEach((key) => {
      if (updatedGrid[key] === nameToRemove) {
        updatedGrid[key] = remainingCat;
      }
    });
    setSeatsGrid(updatedGrid);
  };

  const handleSaveLayout = async () => {
    if (!selectedVenue) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    // Compile layout seats
    const seatsList = [];
    for (let r = 0; r < rowsCount; r++) {
      const rowLabel = getRowLabel(r);
      for (let c = 1; c <= colsCount; c++) {
        const key = `${rowLabel}-${c}`;
        const catName = seatsGrid[key] || categories[0].name;
        seatsList.push({
          row: rowLabel,
          number: c,
          categoryName: catName,
        });
      }
    }

    try {
      await axios.post(`/api/admin/venues/${selectedVenue.id}/layout`, {
        categories,
        seats: seatsList,
      });
      setSuccess('Venue layout, categories and seat mappings saved successfully!');
      fetchVenues();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to save venue layout');
    } finally {
      setLoading(false);
    }
  };

  // Visual helper colors for categories
  const getCategoryColor = (catName: string) => {
    const idx = categories.findIndex((c) => c.name === catName) % 5;
    const colors = [
      'bg-emerald-500 text-white border-emerald-600 hover:bg-emerald-600',
      'bg-indigo-500 text-white border-indigo-600 hover:bg-indigo-600',
      'bg-amber-500 text-white border-amber-600 hover:bg-amber-600',
      'bg-rose-500 text-white border-rose-600 hover:bg-rose-600',
      'bg-cyan-500 text-white border-cyan-600 hover:bg-cyan-600',
    ];
    return colors[idx] || 'bg-gray-500 text-white border-gray-600';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Top Banner */}
      <div className="bg-indigo-900 px-6 py-4 text-white flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">🛡️ Admin Venue Management</h2>
          <p className="text-xs text-indigo-200">Configure physical venues, seat grids and base multipliers</p>
        </div>
        {selectedVenue && (
          <button
            onClick={() => setSelectedVenue(null)}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-indigo-800 hover:bg-indigo-700 rounded-md border border-indigo-700 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Venues
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

        {/* SECTION 1: Venues List / Venue Creation */}
        {!selectedVenue && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800">Venues list</h3>
              <button
                onClick={() => setIsCreatingVenue(!isCreatingVenue)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create New Venue
              </button>
            </div>

            {isCreatingVenue && (
              <form
                onSubmit={handleCreateVenue}
                className="p-4 mb-6 bg-gray-50 border border-gray-200 rounded-lg space-y-4 max-w-md"
              >
                <h4 className="font-semibold text-gray-700 text-sm">Add New Venue Details</h4>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase">Venue Name</label>
                    <input
                      type="text"
                      value={venueName}
                      onChange={(e) => setVenueName(e.target.value)}
                      className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                      placeholder="e.g. Madison Square Garden"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase">Location</label>
                    <input
                      type="text"
                      value={venueLocation}
                      onChange={(e) => setVenueLocation(e.target.value)}
                      className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                      placeholder="e.g. New York, NY"
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsCreatingVenue(false)}
                    className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-50"
                  >
                    Save Venue
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {venues.length === 0 ? (
                <div className="p-8 text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg col-span-2">
                  No venues found. Create one to configure a seat layout.
                </div>
              ) : (
                venues.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => handleSelectVenue(v.id)}
                    className="p-5 border border-gray-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50/20 cursor-pointer transition-all flex flex-col justify-between"
                  >
                    <div>
                      <h4 className="font-bold text-gray-800 text-lg">{v.name}</h4>
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        {v.location}
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-400 font-semibold uppercase tracking-wider">
                      <span>{v._count.seats} Total Seats</span>
                      <span>{v._count.shows} Active Shows</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SECTION 2: Layout Editor */}
        {selectedVenue && (
          <div className="space-y-8">
            <div className="pb-4 border-b border-gray-100">
              <h3 className="text-xl font-extrabold text-gray-800">{selectedVenue.name}</h3>
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                <MapPin className="w-4 h-4 text-gray-400" />
                {selectedVenue.location}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Category Configurations */}
              <div className="space-y-6">
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1.5 mb-4">
                    <Layers className="w-4.5 h-4.5 text-indigo-500" />
                    Seat Categories
                  </h4>

                  {/* Add category form */}
                  <div className="space-y-3 mb-4 p-3 bg-white border border-gray-200 rounded-lg">
                    <span className="block text-xs font-bold text-gray-600 uppercase">Add Category</span>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="e.g. VIP"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        placeholder="Multiplier (e.g. 1.5)"
                        value={newCatMultiplier}
                        onChange={(e) => setNewCatMultiplier(Number(e.target.value))}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      className="w-full text-center py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold"
                    >
                      Add to List
                    </button>
                  </div>

                  {/* Current categories list */}
                  <div className="space-y-2">
                    {categories.map((cat) => (
                      <div
                        key={cat.name}
                        onClick={() => setActiveCategoryName(cat.name)}
                        className={`p-2.5 border rounded-lg flex items-center justify-between cursor-pointer transition-all ${
                          activeCategoryName === cat.name
                            ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-500'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-3 h-3 rounded-full ${
                              getCategoryColor(cat.name).split(' ')[0]
                            }`}
                          ></span>
                          <span className="font-bold text-sm text-gray-700">{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-500">
                            {cat.priceMultiplier.toFixed(2)}x
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveCategory(cat.name);
                            }}
                            className="text-gray-400 hover:text-red-500 transition-colors p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Grid dimensions */}
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                  <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                    <Grid className="w-4.5 h-4.5 text-indigo-500" />
                    Grid Dimensions
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 font-semibold">Rows (A-Z)</label>
                      <input
                        type="number"
                        min="1"
                        max="26"
                        value={rowsCount}
                        onChange={(e) => setRowsCount(Number(e.target.value))}
                        className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 font-semibold">Columns (1-100)</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={colsCount}
                        onChange={(e) => setColsCount(Number(e.target.value))}
                        className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm bg-white"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateGrid}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-sm font-semibold border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Generate Layout Grid
                  </button>
                </div>
              </div>

              {/* Visual Seat Painter Grid */}
              <div className="lg:col-span-2 space-y-4 flex flex-col">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-gray-800 text-md flex items-center gap-1.5">
                    <Grid className="w-5 h-5 text-indigo-500" />
                    Interactive Seat Grid
                  </h4>
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1.5 rounded-lg">
                    <span>Paint Brush:</span>
                    <span className="flex items-center gap-1 text-gray-800">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          getCategoryColor(activeCategoryName).split(' ')[0]
                        }`}
                      ></span>
                      {activeCategoryName}
                    </span>
                  </div>
                </div>

                {/* Grid Visualizer */}
                <div className="p-6 border border-gray-200 rounded-xl bg-gray-900 overflow-x-auto min-h-[300px] flex items-center justify-center relative">
                  {Object.keys(seatsGrid).length === 0 ? (
                    <div className="text-center text-gray-400 p-8 max-w-sm">
                      <Grid className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                      <p className="text-sm">Grid is empty. Click &quot;Generate Layout Grid&quot; on the left menu to draw the seating configuration.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 py-4 select-none">
                      {/* Grid Header column numbers */}
                      <div className="flex gap-2.5 pl-8">
                        {Array.from({ length: colsCount }).map((_, c) => (
                          <div
                            key={c}
                            className="w-10 text-center text-xs font-semibold text-gray-500"
                          >
                            {c + 1}
                          </div>
                        ))}
                      </div>

                      {/* Grid Rows */}
                      {Array.from({ length: rowsCount }).map((_, r) => {
                        const rowLabel = getRowLabel(r);
                        return (
                          <div key={rowLabel} className="flex gap-2.5 items-center">
                            {/* Row side label */}
                            <div className="w-8 text-center text-sm font-extrabold text-indigo-400">
                              {rowLabel}
                            </div>
                            {/* Seat Columns */}
                            {Array.from({ length: colsCount }).map((_, c) => {
                              const seatNum = c + 1;
                              const seatKey = `${rowLabel}-${seatNum}`;
                              const seatCat = seatsGrid[seatKey] || categories[0].name;
                              return (
                                <button
                                  key={seatKey}
                                  type="button"
                                  onClick={() => handleSeatClick(rowLabel, seatNum)}
                                  className={`w-10 h-10 rounded border font-semibold text-[10px] tracking-tighter flex flex-col items-center justify-center shadow-sm cursor-pointer transition-all active:scale-95 ${getCategoryColor(
                                    seatCat,
                                  )}`}
                                  title={`Click to paint category: ${activeCategoryName}`}
                                >
                                  <span>{rowLabel}{seatNum}</span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-100">
                  <button
                    onClick={handleSaveLayout}
                    disabled={loading || Object.keys(seatsGrid).length === 0}
                    className="flex items-center gap-1.5 px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow disabled:opacity-50 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Save Seating Layout
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
