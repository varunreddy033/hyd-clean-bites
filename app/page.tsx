"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Restaurant {
  name: string;
  location: string;
}

interface Inspection {
  id: string;
  rating_percentage: number | null;
  status: string;
  violations: string[] | null;
  restaurants: Restaurant | null;
}

// ==========================================
// ADVANCED GEO-HUB CLUSTER ENGINE
// Automatically maps arbitrary street strings into 3km-5km Anchor Hubs
// ==========================================
interface GeoHub {
  id: string;
  name: string;
  icon: string;
  radius: string;
  keywords: string[];
}

const MAJOR_HUBS: GeoHub[] = [
  { id: 'gachibowli', name: 'Gachibowli & Raidurg', icon: '🏢', radius: '~3.5 km Radius', keywords: ['gachibowli', 'raidurg', 'khajaguda', 'nanakramguda', 'financial district', 'isb', 'anjaiah nagar', 'biodiversity', 'chitrapuri'] },
  { id: 'hitech', name: 'Hitech City & Madhapur', icon: '💻', radius: '~3.0 km Radius', keywords: ['hitech', 'madhapur', 'hitex', 'inorbit', 'jubilee enclave', 'knowledge city', 'image gardens', 'mindspace', 'silicon valley'] },
  { id: 'kondapur', name: 'Kondapur & Hafeezpet', icon: '🛍️', radius: '~4.0 km Radius', keywords: ['kondapur', 'amb mall', 'kims', 'hafeezpet', 'botanical garden', 'raghavendra', 'pnr empire', 'rajarajeshwar'] },
  { id: 'kukatpally', name: 'Kukatpally & KPHB', icon: '🏙️', radius: '~4.5 km Radius', keywords: ['kukatpally', 'kphb', 'jntu', 'ida kukatpally', 'yellammabanda', 'pragathi nagar', 'vivekananda', 'gajularamaram', 'cgr school'] },
  { id: 'miyapur', name: 'Miyapur & Madeenaguda', icon: '🛣️', radius: '~5.0 km Radius', keywords: ['miyapur', 'madeenaguda', 'gsm mall', 'chandanagar', 'lingampally', 'allwyn', 'gangaram', 'deepthi', 'old mumbai highway'] },
  { id: 'nizampet', name: 'Nizampet & Bachupally', icon: '🏡', radius: '~4.0 km Radius', keywords: ['nizampet', 'bachupally', 'mallampet', 'bowrampet', 'dindigul', 'dundigal', 'devbhoomi'] },
  { id: 'serilingampally', name: 'Serilingampally & Tellapur', icon: '🌳', radius: '~6.0 km Radius', keywords: ['serilingampally', 'tellapur', 'nallagandla', 'gopanpally', 'kollur', 'ameenpur', 'rc puram', 'osman nagar', 'puppalaguda', 'manikonda', 'rodamestry'] },
];

// Helper: Auto-maps any location string to its geographical Anchor Hub
const assignToHub = (rawLocation: string | undefined): string => {
  if (!rawLocation) return 'other';
  const clean = rawLocation.toLowerCase();
  
  for (const hub of MAJOR_HUBS) {
    if (hub.keywords.some(kw => clean.includes(kw))) {
      return hub.id;
    }
  }
  return 'other';
};

const getTheme = (status: string, isDark: boolean) => {
  if (status === 'Good') {
    return { 
      color: isDark ? "from-emerald-500 to-green-400" : "from-emerald-600 to-green-500", 
      glow: isDark ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.25)" 
    };
  }
  if (status === 'Critical') {
    return { 
      color: isDark ? "from-pink-600 to-red-500" : "from-rose-600 to-red-500", 
      glow: isDark ? "rgba(219, 39, 119, 0.25)" : "rgba(225, 29, 72, 0.3)" 
    };
  }
  return { 
    color: isDark ? "from-violet-500 to-purple-400" : "from-purple-600 to-fuchsia-500", 
    glow: isDark ? "rgba(139, 92, 246, 0.2)" : "rgba(147, 51, 234, 0.25)" 
  };
};

export default function PremiumDashboard() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'lavender'>('dark');
  
  // Search and Geographical Hub Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHub, setSelectedHub] = useState<string>('all');

  const isDark = theme === 'dark';

  useEffect(() => {
    async function loadData() {
      const { data, error } = await supabase
        .from('inspections')
        .select(`
          id,
          rating_percentage,
          status,
          violations,
          restaurants ( name, location )
        `)
        .order('inspection_date', { ascending: false });
      
      if (data) setInspections(data as unknown as Inspection[]);
      if (error) console.error("Error fetching:", error);
    }
    loadData();
  }, []);

  // Calculate dynamic counts for each Anchor Hub
  const hubCounts = useMemo(() => {
    const counts: Record<string, number> = { all: inspections.length, other: 0 };
    MAJOR_HUBS.forEach(h => counts[h.id] = 0);

    inspections.forEach(item => {
      const hubId = assignToHub(item.restaurants?.location);
      counts[hubId] = (counts[hubId] || 0) + 1;
    });
    return counts;
  }, [inspections]);

  // Filter dataset based on Search Text AND Anchor Hub Cluster
  const filteredInspections = useMemo(() => {
    return inspections.filter(item => {
      const matchesSearch = item.restaurants?.name
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase());
      
      const itemHubId = assignToHub(item.restaurants?.location);
      const matchesHub = selectedHub === 'all' ? true : itemHubId === selectedHub;

      return matchesSearch && matchesHub;
    });
  }, [inspections, searchQuery, selectedHub]);

  const activeInspection = inspections.find(item => item.id === selectedId);
  const activeHubMeta = MAJOR_HUBS.find(h => h.id === selectedHub);

  return (
    <div className={`relative min-h-screen overflow-hidden font-sans p-6 md:p-12 transition-colors duration-700 ${isDark ? 'bg-[#07050B] text-white' : 'bg-[#FAFAFF] text-slate-900'}`}>
      
      {/* Background Ambient Glows */}
      <div className={`absolute top-[-10%] left-[20%] w-[600px] h-[600px] rounded-full blur-[160px] pointer-events-none transition-colors duration-700 ${isDark ? 'bg-purple-600/10' : 'bg-[#EEE6FF]'}`} />
      <div className={`absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none transition-colors duration-700 ${isDark ? 'bg-[#8B5CF6]/5' : 'bg-purple-200/40'}`} />

      {/* Header */}
      <header className="relative z-10 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center max-w-7xl mx-auto gap-4">
        <div>
          <span className={`text-xs font-semibold tracking-[0.25em] uppercase ${isDark ? 'text-purple-400/80' : 'text-purple-600'}`}>
            Division Live Operations • Smart Geo-Clustering
          </span>
          <h1 className={`text-4xl font-bold tracking-tight bg-gradient-to-r bg-clip-text text-transparent mt-1 ${isDark ? 'from-white via-slate-200 to-slate-400' : 'from-purple-950 via-purple-800 to-purple-600'}`}>
            Cyberabad Clean Bites
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setTheme(isDark ? 'lavender' : 'dark')}
            className={`px-4 py-2 rounded-full text-sm font-semibold backdrop-blur-md transition-all duration-300 flex items-center gap-2 ${
              isDark 
                ? 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white' 
                : 'bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 shadow-sm shadow-purple-200/50'
            }`}
          >
            {isDark ? '✨ Lavender Mode' : '🌙 Panther Mode'}
          </button>

          <div className={`px-4 py-2 rounded-full text-sm font-medium backdrop-blur-md border ${isDark ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-white border-purple-100 text-purple-900 shadow-sm'}`}>
            📍 Monitoring {inspections.length} Locations
          </div>
        </div>
      </header>

      {/* Control Center (Search & Geographical Cluster Hubs) */}
      <section className="relative z-10 max-w-7xl mx-auto mb-10 space-y-5">
        <div className="relative max-w-xl">
          <input
            type="text"
            placeholder="🔍 Search specific establishment names across Cyberabad..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full px-6 py-4 rounded-2xl outline-none border backdrop-blur-xl transition-all duration-300 ${
              isDark 
                ? 'bg-white/[0.03] border-white/10 text-white placeholder-slate-500 focus:border-purple-500/50 focus:bg-white/[0.05]' 
                : 'bg-white border-purple-100 text-slate-900 placeholder-slate-400 shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100'
            }`}
          />
        </div>

        {/* Anchor Hub Cluster Selector */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-semibold tracking-wider uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Select Anchor Hub (Auto-Clustering Active)
            </span>
            {selectedHub !== 'all' && activeHubMeta && (
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${isDark ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-purple-100 text-purple-800'}`}>
                🎯 Filtered within {activeHubMeta.radius}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setSelectedHub('all')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-300 flex items-center gap-2 ${
                selectedHub === 'all'
                  ? (isDark ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30 font-bold scale-105' : 'bg-purple-600 text-white shadow-md shadow-purple-200 font-bold scale-105')
                  : (isDark ? 'bg-white/[0.03] border border-white/5 text-slate-400 hover:text-white hover:bg-white/[0.06]' : 'bg-white border border-purple-100 text-slate-600 hover:bg-purple-50')
              }`}
            >
              <span>🌐</span>
              <span>All Clusters ({hubCounts['all']})</span>
            </button>

            {MAJOR_HUBS.map((hub) => {
              const count = hubCounts[hub.id] || 0;
              if (count === 0 && selectedHub !== hub.id) return null; // Hide empty hubs cleanly

              return (
                <button
                  key={hub.id}
                  onClick={() => setSelectedHub(hub.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-300 flex items-center gap-2 ${
                    selectedHub === hub.id
                      ? (isDark ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30 font-bold scale-105' : 'bg-purple-600 text-white shadow-md shadow-purple-200 font-bold scale-105')
                      : (isDark ? 'bg-white/[0.03] border border-white/5 text-slate-400 hover:text-white hover:bg-white/[0.06]' : 'bg-white border border-purple-100 text-slate-600 hover:bg-purple-50')
                  }`}
                >
                  <span>{hub.icon}</span>
                  <span>{hub.name}</span>
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${selectedHub === hub.id ? 'bg-black/20 text-white' : (isDark ? 'bg-white/10 text-slate-300' : 'bg-purple-100 text-purple-800')}`}>
                    {count}
                  </span>
                </button>
              );
            })}

            {/* Emerging / Other Zones Catch-all */}
            {hubCounts['other'] > 0 && (
              <button
                onClick={() => setSelectedHub('other')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-300 flex items-center gap-2 ${
                  selectedHub === 'other'
                    ? (isDark ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30 font-bold scale-105' : 'bg-purple-600 text-white shadow-md shadow-purple-200 font-bold scale-105')
                    : (isDark ? 'bg-white/[0.03] border border-white/5 text-slate-400 hover:text-white hover:bg-white/[0.06]' : 'bg-white border border-purple-100 text-slate-600 hover:bg-purple-50')
                }`}
              >
                <span>📍</span>
                <span>Emerging Zones ({hubCounts['other']})</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main Bento Grid Platform */}
      <main className="relative z-10 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Interactive Fluid Inspection Grid */}
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredInspections.map((item) => {
              const themeConfig = getTheme(item.status, isDark);
              const restaurantName = item.restaurants?.name || "Unknown Establishment";
              const restaurantLocation = item.restaurants?.location || "Cyberabad";

              return (
                <motion.div
                  layout
                  layoutId={`card-${item.id}`}
                  onClick={() => setSelectedId(item.id)}
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ y: -5, scale: 1.01 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className={`relative cursor-pointer overflow-hidden rounded-2xl border p-6 backdrop-blur-xl group transition-colors duration-500 ${
                    isDark 
                      ? 'border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent' 
                      : 'border-purple-100 bg-white/70 shadow-[0_8px_30px_rgb(147,51,234,0.06)] hover:shadow-[0_8px_30px_rgb(147,51,234,0.12)]'
                  }`}
                  style={isDark ? { boxShadow: `inset 0 0 12px rgba(255,255,255,0.01)` } : {}}
                >
                  <div className={`absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none ${isDark ? 'from-purple-500/0 via-purple-500/10 to-purple-500/0' : 'from-purple-300/0 via-purple-300/20 to-purple-300/0'}`} />
                  
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className={`text-lg font-semibold tracking-tight transition-colors line-clamp-1 ${isDark ? 'text-white group-hover:text-purple-300' : 'text-slate-900 group-hover:text-purple-700'}`}>
                        {restaurantName}
                      </h3>
                      <p className={`text-sm mt-0.5 truncate max-w-[180px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        📍 {restaurantLocation}
                      </p>
                    </div>
                    <div className={`text-2xl font-extrabold bg-gradient-to-r ${themeConfig.color} bg-clip-text text-transparent`}>
                      {item.rating_percentage !== null ? `${item.rating_percentage}%` : '--'}
                    </div>
                  </div>

                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border mt-2 ${isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-purple-100'}`}>
                    <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${themeConfig.color}`} style={{ boxShadow: `0 0 10px ${themeConfig.glow}` }} />
                    <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>{item.status}</span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          
          {filteredInspections.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full py-12 text-center text-slate-400 italic"
            >
              No active inspection records match your current Anchor Hub or search filters.
            </motion.div>
          )}
        </div>

        {/* Dynamic Side Bento Metric Box */}
        <div className={`rounded-2xl border p-6 backdrop-blur-xl flex flex-col h-64 md:sticky md:top-6 overflow-hidden transition-colors duration-500 ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-purple-100 bg-white shadow-xl shadow-purple-900/5'}`}>
          <div className={`absolute -right-12 -top-12 w-40 h-40 rounded-full blur-3xl pointer-events-none ${isDark ? 'bg-purple-500/10' : 'bg-purple-300/20'}`} />
          <div>
            <h3 className={`text-sm font-semibold tracking-widest uppercase ${isDark ? 'text-slate-400' : 'text-purple-500'}`}>Cluster Analytics</h3>
            <div className={`text-6xl font-black mt-4 bg-gradient-to-b bg-clip-text text-transparent ${isDark ? 'from-white to-slate-500' : 'from-purple-900 to-purple-500'}`}>
              {filteredInspections.length}
            </div>
            <p className={`text-sm font-medium mt-1 ${isDark ? 'text-purple-400' : 'text-slate-600'}`}>
              {selectedHub === 'all' ? 'Total Cyberabad Records' : `Spots in ${activeHubMeta?.name || 'Selected Hub'}`}
            </p>
          </div>
          <div className={`mt-auto border-t pt-4 ${isDark ? 'border-white/5' : 'border-purple-100'}`}>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Auto-snapping algorithm active. Incoming Twitter data is automatically clustered into 3km-5km regional hubs.
            </p>
          </div>
        </div>
      </main>

      {/* Smooth Ambient Modal Detail Overlay */}
      <AnimatePresence>
        {selectedId && activeInspection && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
            <motion.div
              layoutId={`card-${selectedId}`}
              className={`relative w-full max-w-lg overflow-hidden rounded-3xl border p-8 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar ${
                isDark ? 'bg-[#0E0B18] border-white/10 text-white' : 'bg-[#FAFAFF] border-purple-200 text-slate-900 shadow-purple-900/20'
              }`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div 
                className="absolute -top-24 -left-24 w-60 h-60 rounded-full blur-[100px] pointer-events-none transition-all" 
                style={{ backgroundColor: getTheme(activeInspection.status, isDark).glow.replace('0.', '0.4') }} 
              />

              <div className="flex justify-between items-start mb-6 relative z-10">
                <div>
                  <span className={`text-xs font-bold tracking-widest uppercase ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>Audit Infraction File</span>
                  <h2 className="text-2xl font-bold tracking-tight mt-1">{activeInspection.restaurants?.name}</h2>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>📍 {activeInspection.restaurants?.location}</p>
                </div>
                <button 
                  onClick={() => setSelectedId(null)}
                  className={`rounded-full border p-2 transition-colors ${
                    isDark ? 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10' : 'bg-white border-purple-200 text-slate-500 hover:text-purple-700 hover:bg-purple-50'
                  }`}
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6 relative z-10">
                <div className={`flex items-center gap-6 border p-4 rounded-xl ${isDark ? 'bg-white/[0.02] border-white/5' : 'bg-white border-purple-100 shadow-sm'}`}>
                  <div>
                    <p className={`text-xs uppercase font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Compliance Index</p>
                    <p className={`text-4xl font-black bg-gradient-to-r ${getTheme(activeInspection.status, isDark).color} bg-clip-text text-transparent`}>
                      {activeInspection.rating_percentage !== null ? `${activeInspection.rating_percentage}%` : '--'}
                    </p>
                  </div>
                  <div className={`h-8 w-[1px] ${isDark ? 'bg-white/10' : 'bg-purple-100'}`} />
                  <div>
                    <p className={`text-xs uppercase font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Safety Status</p>
                    <p className={`text-lg font-bold mt-0.5 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{activeInspection.status}</p>
                  </div>
                </div>

                <div>
                  <h4 className={`text-sm font-semibold tracking-wider uppercase mb-3 ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>Identified Violations</h4>
                  {activeInspection.violations && activeInspection.violations.length > 0 ? (
                    <ul className="space-y-2.5">
                      {activeInspection.violations.map((violation, i) => (
                        <li key={i} className={`flex items-start gap-2.5 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                          <span className={`mt-1 ${isDark ? 'text-purple-400' : 'text-purple-500'}`}>✦</span>
                          <span className="leading-relaxed">{violation}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={`text-sm italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No specific violations recorded.</p>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Scrollbar UI Injection */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.3); border-radius: 10px; }
      `}} />
    </div>
  );
}