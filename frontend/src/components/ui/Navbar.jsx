import React, { useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { LogOut, Store, ShieldCheck, MapPin } from 'lucide-react';

const Navbar = () => {
  const { user, logout } = useContext(AuthContext);

  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 text-white shadow-lg transition-all">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        
        {/* Brand / Logo */}
        <div className="flex items-center space-x-3 group cursor-pointer">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-md group-hover:scale-105 transition-transform duration-200">
            <Store className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
              PointOfSale
            </span>
            <span className="hidden sm:inline-block text-[10px] text-slate-400 ml-2 font-mono tracking-wider uppercase bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-700/50">
              by sajid
            </span>
          </div>
        </div>

        {/* User Info & Actions */}
        {user && (
          <div className="flex items-center space-x-4 text-xs font-medium">
            
            {/* User Profile Badge */}
            <div className="flex items-center space-x-2 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 rounded-xl px-3 py-1.5 transition">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-slate-200 font-semibold">{user.roleTakerName}</span>
              <span className="text-slate-500">•</span>
              <span className="inline-flex items-center text-blue-400 font-bold uppercase tracking-wider text-[10px]">
                <ShieldCheck className="h-3 w-3 mr-1" />
                {user.role}
              </span>
            </div>

            {/* Branch Badge */}
            {user.branchNumber && (
              <div className="hidden md:flex items-center space-x-1.5 bg-slate-800/40 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-700/50">
                <MapPin className="h-3.5 w-3.5 text-indigo-400" />
                <span>Branch #{user.branchNumber}</span>
              </div>
            )}

            {/* Logout Button */}
            <button
              onClick={logout}
              className="group inline-flex items-center space-x-1.5 bg-rose-600/90 hover:bg-rose-600 text-white font-semibold px-3.5 py-1.5 rounded-xl transition-all duration-200 shadow-md hover:shadow-rose-600/20 active:scale-95"
            >
              <LogOut className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;