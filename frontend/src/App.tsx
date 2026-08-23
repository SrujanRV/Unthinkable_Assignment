import HealthDashboard from './components/HealthDashboard';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <span className="text-5xl">🎟️</span>
        <h2 className="mt-4 text-3xl font-extrabold text-gray-900 tracking-tight">
          Antigravity Booking
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Real-time High Concurrency Concert & Movie Tickets
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
        <HealthDashboard />
      </div>
    </div>
  );
}
