import React, { useEffect, useState } from 'react';

const ViewportGuard = ({ children }) => {
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const check = () => {
      const width = window.innerWidth || document.documentElement.clientWidth;
      const ua = navigator.userAgent || '';
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      const isSmall = width < 1024 || isMobileUA;
      setIsDesktop(!isSmall);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!isDesktop) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 text-white px-6 text-center">
        <div className="max-w-xl space-y-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            OpenPOS is built exclusively for PC and laptop desktop browsers.
          </h1>
          <p className="text-slate-300 text-sm md:text-base">
            Please open the application from a desktop or laptop device.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ViewportGuard;
