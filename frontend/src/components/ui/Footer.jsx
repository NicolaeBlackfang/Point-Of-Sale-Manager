import React from 'react';
import { Store, Shield, Phone, Mail, ExternalLink, Heart, Globe, HelpCircle } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-10">
        
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          
          {/* Brand Column */}
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-md">
                <Store className="h-5 w-5 text-white" />
              </div>
              <span className="font-extrabold text-base tracking-tight text-white">
                PointOfSale
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Streamlined inventory, cash register POS, and administrative analytics platform engineered for multi-branch retail operations.
            </p>
            <div className="inline-flex items-center space-x-2 bg-slate-800/80 px-2.5 py-1 rounded-lg text-[11px] border border-slate-700/60">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-slate-300 font-medium">All Systems Operational</span>
            </div>
          </div>

          {/* Quick Navigation Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">Modules & Tools</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="#inventory" className="hover:text-blue-400 transition flex items-center space-x-1.5">
                  <span>Inventory Operator Workspace</span>
                </a>
              </li>
              <li>
                <a href="#pos" className="hover:text-blue-400 transition flex items-center space-x-1.5">
                  <span>Cashier POS Terminal</span>
                </a>
              </li>
              <li>
                <a href="#admin" className="hover:text-blue-400 transition flex items-center space-x-1.5">
                  <span>Superadmin Control Panel</span>
                </a>
              </li>
              <li>
                <a href="#analytics" className="hover:text-blue-400 transition flex items-center space-x-1.5">
                  <span>Sales & Financial Exports</span>
                </a>
              </li>
            </ul>
          </div>

          {/* System & Support */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">Support & Resources</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="#docs" className="hover:text-blue-400 transition flex items-center space-x-1">
                  <HelpCircle className="h-3.5 w-3.5 text-slate-500" />
                  <span>User Guide & Scanner Setup</span>
                </a>
              </li>
              <li>
                <a href="#privacy" className="hover:text-blue-400 transition flex items-center space-x-1">
                  <Shield className="h-3.5 w-3.5 text-slate-500" />
                  <span>Audit Logs & Security</span>
                </a>
              </li>
              <li>
                <a href="#status" className="hover:text-blue-400 transition flex items-center space-x-1">
                  <Globe className="h-3.5 w-3.5 text-slate-500" />
                  <span>Branch Network Status</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Contact / Info */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">System Information</h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center space-x-2">
                <Mail className="h-3.5 w-3.5 text-blue-400" />
                <span>support@pos-system.local</span>
              </div>
              <div className="flex items-center space-x-2">
                <Phone className="h-3.5 w-3.5 text-blue-400" />
                <span>Branch Support: +1 (800) 555-POS</span>
              </div>
              <div className="pt-1">
                <span className="text-[11px] bg-slate-800 text-slate-300 font-mono px-2 py-1 rounded border border-slate-700">
                  v2.4.0 • Enterprise Edition
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Divider */}
        <div className="border-t border-slate-800/80 pt-6 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 gap-4">
          <div>
            © {new Date().getFullYear()} PointOfSale System. All rights reserved.
          </div>
          <div className="flex items-center space-x-1">
            <span>Crafted with</span>
            <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500 inline" />
            <span>by</span>
            <span className="font-semibold text-slate-300">sajid</span>
          </div>
        </div>

      </div>
    </footer>
  );
};

export default Footer;