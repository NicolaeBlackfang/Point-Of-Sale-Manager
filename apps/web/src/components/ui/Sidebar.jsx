import React, { useContext, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { ThemeContext } from '../../context/ThemeContext';
import {
  Store,
  LogOut,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  MapPin,
  ShieldCheck,
  Wifi,
  WifiOff,
  CloudUpload,
} from 'lucide-react';
import { getQueueCount } from '../../services/offline';

// group: { label, items: [{ key, label, icon }] }
const Sidebar = ({ groups = [], activeKey, onNavigate, collapsed = false, onToggleCollapse }) => {
  const { user, logout } = useContext(AuthContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [queuedCount, setQueuedCount] = useState(0);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const refresh = () => getQueueCount().then(setQueuedCount).catch(() => {});
    refresh();
    const interval = setInterval(refresh, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const widthClass = collapsed ? 'w-20' : 'w-64';

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 ${widthClass} bg-slate-900 text-slate-200 border-r border-slate-800 flex flex-col transition-all duration-300`}
    >
      {/* Top: Logo / Branch / Active user */}
      <div className={`p-4 border-b border-slate-800 space-y-3 ${collapsed ? 'px-2' : ''}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-600/30 flex-shrink-0">
              <Store className="h-5 w-5 text-white" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <span className="block font-extrabold text-[15px] leading-tight tracking-tight text-white truncate">
                  Open<span className="text-blue-400">POS</span>
                </span>
                <span className="text-[10px] text-slate-400 uppercase tracking-[0.18em] truncate block">
                  Retail &amp; POS
                </span>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={onToggleCollapse}
              title="Collapse sidebar"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition flex-shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={onToggleCollapse}
            title="Expand sidebar"
            className="w-full flex items-center justify-center p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {user && !collapsed && (
          <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl px-3 py-2.5 space-y-1.5">
            <div className="flex items-center space-x-2 min-w-0">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-semibold text-slate-100 truncate">
                {user.roleTakerName}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="inline-flex items-center text-blue-400 font-bold uppercase tracking-wider">
                <ShieldCheck className="h-3 w-3 mr-1" />
                {user.role}
              </span>
              {user.branchNumber && (
                <span className="inline-flex items-center text-slate-400">
                  <MapPin className="h-3 w-3 mr-1" />
                  Branch #{user.branchNumber}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Middle: Module navigation (grouped) */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-1.5 px-3">
        {groups.map((group, groupIndex) => (
          <div key={group.label} className={groupIndex > 0 ? 'pt-2' : ''}>
            {!collapsed ? (
              <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                {group.label}
              </p>
            ) : (
              groupIndex > 0 && <div className="mx-2 mb-2 border-t border-slate-800" />
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeKey === item.key;
                return (
                  <li key={item.key} className="relative">
                    <button
                      onClick={() => onNavigate?.(item.key)}
                      title={collapsed ? item.label : undefined}
                      className={`group w-full flex items-center ${
                        collapsed ? 'justify-center' : 'space-x-3'
                      } px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                        active
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-600/25'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800 hover:translate-x-0.5'
                      }`}
                    >
                      {active && !collapsed && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-blue-400" />
                      )}
                      <Icon
                        className={`h-4 w-4 flex-shrink-0 transition-colors ${
                          active ? 'text-white' : 'text-slate-500 group-hover:text-blue-400'
                        }`}
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom: status, theme, logout */}
      <div className="p-3 border-t border-slate-800 space-y-2">
        {!collapsed && (
          <div className="flex items-center justify-between text-[10px] px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
            <span className="inline-flex items-center space-x-1">
              {isOnline ? (
                <>
                  <Wifi className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">System Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-amber-400" />
                  <span className="text-amber-400 font-semibold">Offline</span>
                </>
              )}
            </span>
            {queuedCount > 0 && (
              <span className="inline-flex items-center space-x-1 text-blue-400 font-semibold">
                <CloudUpload className="h-3 w-3" />
                <span>{queuedCount} queued</span>
              </span>
            )}
          </div>
        )}

        <div className="flex items-center space-x-2">
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex-1 inline-flex items-center justify-center space-x-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-slate-300 py-2 rounded-xl transition active:scale-95 text-xs font-semibold"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {!collapsed && <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>}
          </button>
          <button
            onClick={logout}
            title="Logout"
            className="flex-1 inline-flex items-center justify-center space-x-1.5 bg-rose-600/90 hover:bg-rose-600 text-white py-2 rounded-xl transition active:scale-95 text-xs font-semibold shadow-md"
          >
            <LogOut className="h-3.5 w-3.5" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
