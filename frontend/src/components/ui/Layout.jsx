import React, { useState, useEffect } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import { getQueueCount } from '../../services/offline';
import { WifiOff, CloudUpload } from 'lucide-react';

const Layout = ({ children }) => {
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [queuedCount, setQueuedCount] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      // Reveals footer once user scrolls down 30px
      if (window.scrollY > 30) {
        setHasScrolled(true);
      } else {
        setHasScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Offline status + pending offline sales queue
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const refreshQueueCount = () => getQueueCount().then(setQueuedCount).catch(() => {});
    refreshQueueCount();
    const interval = setInterval(refreshQueueCount, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-50">
      <div className="flex-1 flex flex-col">
        {/* Dynamic Fixed Navbar */}
        <Navbar />

        {/* Offline mode banner */}
        {(!isOnline || queuedCount > 0) && (
          <div
            className={`${
              !isOnline ? 'bg-amber-500' : 'bg-blue-600'
            } text-white text-xs font-semibold px-4 py-1.5 flex items-center justify-center gap-2`}
          >
            {!isOnline ? (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                <span>Offline mode - sales will be queued and synced when connection returns.</span>
              </>
            ) : (
              <>
                <CloudUpload className="h-3.5 w-3.5" />
                <span>{queuedCount} queued offline sale(s) pending sync...</span>
              </>
            )}
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-20 space-y-6">
          {children}
        </main>
      </div>

      {/* Animated Footer Container */}
      <div
        className={`transition-all duration-500 ease-in-out transform ${
          hasScrolled
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-6 pointer-events-none'
        }`}
      >
        <Footer />
      </div>
    </div>
  );
};

export default Layout;
