export function UserLocationMarker() {
    return (
      <div className="relative flex items-center justify-center">
        {/* Outer glow/pulse effect */}
        <div className="absolute w-10 h-10 bg-blue-400 rounded-full opacity-30 animate-ping"></div>
        
        {/* Main marker */}
        <div className="relative w-5 h-5 bg-blue-500 rounded-full border-2 border-white shadow-lg z-10"></div>
      </div>
    );
  }
  