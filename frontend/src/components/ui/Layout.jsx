import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { getQueueCount } from '../../services/offline';
import { WifiOff, CloudUpload } from 'lucide-react';

const Layout = ({ children, navGroups = [], activeKey = null, onNavigate = null }) => {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [queuedCount, setQueuedCount] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Offline status + pending offline sales queue
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
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Left Sidebar (collapsible) */}
      <Sidebar
        groups={navGroups}
        activeKey={activeKey}
        onNavigate={onNavigate}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />

      {/* Main column, offset by sidebar width */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${collapsed ? 'ml-20' : 'ml-64'}`}>
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
        <main className="flex-1 w-full mx-auto px-6 py-8 space-y-6 max-w-[1400px]">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
