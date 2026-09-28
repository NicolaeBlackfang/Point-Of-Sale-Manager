import React, { useState, useEffect } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

const Layout = ({ children }) => {
  const [hasScrolled, setHasScrolled] = useState(false);

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

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-50">
      <div className="flex-1 flex flex-col">
        {/* Dynamic Fixed Navbar */}
        <Navbar />

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