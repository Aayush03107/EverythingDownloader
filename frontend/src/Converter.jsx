/* src/Converter.jsx */
import { useState, useEffect, useRef } from 'react';

// --- CONFIG ---
// Automatically switches between localhost (dev) and your domain (prod)
const API_URL = import.meta.env.VITE_API_URL;

// --- ICONS ---
const YouTubeIcon = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>;
const XIcon = () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>;
const InstagramIcon = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>;
const TikTokIcon = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93v6.14c0 3.48-2.63 6.13-5.95 6.16-3.48.03-6.14-2.64-6.14-6.16.03-3.32 2.73-6.07 6.08-6.07.13 0 .26.01.39.03v4.22a2.12 2.12 0 0 0-2.26 2.06c.03 1.13 1.05 2.06 2.18 2.04 1.2-.02 2.18-1 2.18-2.2V.02z"/></svg>;
const VideoIcon = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>;
const MusicIcon = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>;
const DownloadIcon = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>;
const CancelIcon = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;

const Converter = () => {
  const [url, setUrl] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [format, setFormat] = useState('mp4');

  const [qualities, setQualities] = useState([
    { resolution: 1080, size: null },
    { resolution: 720, size: null },
    { resolution: 480, size: null },
    { resolution: 360, size: null }
  ]);
  const [selectedQuality, setSelectedQuality] = useState('1080');

  const [status, setStatus] = useState('Ready');
  const [loading, setLoading] = useState(false);
  const [calculatingSizes, setCalculatingSizes] = useState(false);
  const [fetchingPreview, setFetchingPreview] = useState(false);

  const [progress, setProgress] = useState(0);
  const [downloadDetails, setDownloadDetails] = useState({ total: '...', speed: '...' });
  const [currentRequestId, setCurrentRequestId] = useState(null);

  const eventSourceRef = useRef(null);
  const abortControllerRef = useRef(null);

  /* ---------------- URL WATCH ---------------- */
  useEffect(() => {
    if (!url) {
      setMetadata(null);
      resetQualities();
      setStatus('Ready');
      return;
    }

    const timer = setTimeout(() => {
      if (url.includes('http')) {
        fetchFastPreview(url);
        if (!url.includes('spotify')) fetchRealQualities(url);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [url]);

  const resetQualities = () => {
    setQualities([
      { resolution: 1080, size: null },
      { resolution: 720, size: null },
      { resolution: 480, size: null },
      { resolution: 360, size: null }
    ]);
    setCalculatingSizes(false);
  };

  const fetchFastPreview = async (fetchUrl) => {
    setFetchingPreview(true);
    try {
      // USE VARIABLE HERE
      const res = await fetch(`${API_URL}/meta?url=${encodeURIComponent(fetchUrl)}`);
      
      if (res.status === 403) throw new Error("Security Risk: This URL is blocked.");
      if (res.status === 429) throw new Error("Too many requests. Please wait.");

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setMetadata(data);
      setStatus('Ready to download');
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setFetchingPreview(false);
    }
  };

  const fetchRealQualities = async (fetchUrl) => {
    setCalculatingSizes(true);
    try {
      // USE VARIABLE HERE
      const res = await fetch(`${API_URL}/formats?url=${encodeURIComponent(fetchUrl)}`);
      if (res.status === 429) return;

      const data = await res.json();
      if (data.formats) {
        const updated = [1080, 720, 480, 360].map(r =>
          data.formats.find(f => f.resolution === r) || { resolution: r, size: null }
        );
        setQualities(updated);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCalculatingSizes(false);
    }
  };

  const handleCancel = async () => {
    if (!currentRequestId) return;
    if (eventSourceRef.current) eventSourceRef.current.close();
    if (abortControllerRef.current) abortControllerRef.current.abort();

    try {
      // USE VARIABLE HERE
      await fetch(`${API_URL}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: currentRequestId })
      });
    } catch {}

    setLoading(false);
    setProgress(0);
    setStatus('Cancelled');
    setCurrentRequestId(null);
  };

  const handleDownload = async () => {
    setLoading(true);
    setProgress(0);
    setStatus('Initializing...');
    setDownloadDetails({ total: 'Calculating...', speed: '0 MB/s' });

    const requestId = Date.now().toString();
    setCurrentRequestId(requestId);
    abortControllerRef.current = new AbortController();

    // USE VARIABLE HERE (SSE)
    const eventSource = new EventSource(`${API_URL}/events?requestId=${requestId}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.status === 'Downloading') {
        setProgress(data.progress);
        if (data.total !== '...') setDownloadDetails({ total: data.total, speed: data.speed });
        setStatus(`Downloading ${Math.round(data.progress)}%`);
      } else if (data.status === 'Queued') {
        setStatus(`Waiting in queue... (Position #${data.position})`);
      } else if (data.status === 'Complete') {
        setProgress(100);
        eventSource.close();
      } else if (data.status === 'Cancelled') {
        setStatus('Cancelled');
        setLoading(false);
        eventSource.close();
      } else if (data.status === 'Error') {
        setStatus('Error occurred');
        setLoading(false);
        eventSource.close();
      }
    };

    try {
      // USE VARIABLE HERE
      const response = await fetch(`${API_URL}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          format,
          quality: format === 'mp4' ? selectedQuality : null,
          requestId
        }),
        signal: abortControllerRef.current.signal
      });

      if (response.status === 403) throw new Error("Security Alert: URL is blocked.");
      if (response.status === 429) throw new Error("Server busy. Try later.");
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${metadata?.title || 'download'}.${format}`;
      a.click();
      URL.revokeObjectURL(downloadUrl);

      setStatus('Download complete');
      setLoading(false);
    } catch (e) {
      if (e.name !== 'AbortError') {
        setStatus(`Failed: ${e.message}`);
        setLoading(false);
      }
      if (eventSourceRef.current) eventSourceRef.current.close();
    }
  };

  const getDownloadedAmount = () => {
    const total = parseFloat(downloadDetails.total);
    if (isNaN(total)) return '0';
    return ((total * progress) / 100).toFixed(1);
  };

  // --- RENDER (The design you liked) ---
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white p-4 font-sans selection:bg-fuchsia-500 selection:text-white w-full overflow-hidden">
      
      {/* Background Ambience */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[10%] left-[20%] w-96 h-96 bg-purple-600/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[10%] right-[20%] w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        
        {/* Main Card */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 p-6 md:p-8 rounded-3xl shadow-2xl ring-1 ring-white/5">
          
          <div className="text-center mb-6">
            <h1 className="text-3xl font-black tracking-tighter bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400 bg-clip-text text-transparent drop-shadow-sm">
              Universal Saver
            </h1>
            <div className="flex justify-center gap-4 mt-4 text-slate-500">
                <div className="hover:text-red-500 transition-colors duration-300 hover:scale-110 transform cursor-default"><YouTubeIcon /></div>
                <div className="hover:text-white transition-colors duration-300 hover:scale-110 transform cursor-default"><XIcon /></div>
                <div className="hover:text-pink-500 transition-colors duration-300 hover:scale-110 transform cursor-default"><InstagramIcon /></div>
                <div className="hover:text-cyan-400 transition-colors duration-300 hover:scale-110 transform cursor-default"><TikTokIcon /></div>
            </div>
          </div>
          
          <div className="relative group mb-8">
            <input 
              type="text" 
              placeholder="Paste link here..." 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full py-3 bg-transparent border-b border-white/20 text-center text-lg placeholder-slate-500 text-white focus:outline-none focus:border-fuchsia-500 transition-colors duration-300 font-medium"
            />
            <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-fuchsia-500 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
            
            {fetchingPreview && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2">
                 <div className="w-5 h-5 border-2 border-white/10 border-t-fuchsia-500 rounded-full animate-spin" />
              </div>
            )}
          </div>

          {metadata && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-slate-800/50 rounded-2xl overflow-hidden border border-white/5 shadow-lg group hover:shadow-violet-900/20 transition-all duration-300">
                
                <div className="relative w-full pt-[56.25%] bg-black overflow-hidden">
                    <img 
                        src={metadata.thumbnail} 
                        className="absolute top-0 left-0 w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-105" 
                    />
                    {metadata.isSpotify && (
                        <div className="absolute top-2 right-2 bg-black/80 backdrop-blur text-[#1DB954] text-[10px] font-bold px-3 py-1 rounded-full border border-[#1DB954]/20 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] animate-pulse"/> SPOTIFY
                        </div>
                    )}
                </div>
                
                <div className="p-4">
                    <h3 className="text-white text-sm font-bold line-clamp-1">{metadata.title}</h3>
                    <p className="text-slate-400 text-xs mt-1">{metadata.uploader}</p>
                </div>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                    
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                             <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                {format === 'mp4' ? <VideoIcon /> : <MusicIcon />}
                            </div>
                            <select 
                                value={format} 
                                onChange={(e) => setFormat(e.target.value)}
                                className="w-full pl-9 pr-2 py-3 rounded-lg bg-slate-800 border border-slate-700/50 text-sm font-semibold text-white appearance-none cursor-pointer focus:border-violet-500 outline-none hover:bg-slate-750 transition-colors"
                            >
                                <option value="mp4">Video</option>
                                <option value="mp3">Audio</option>
                            </select>
                        </div>

                        {format === 'mp4' && !metadata.isSpotify && (
                            <div className="relative flex-1">
                                <select 
                                    value={selectedQuality} 
                                    onChange={(e) => setSelectedQuality(e.target.value)}
                                    disabled={calculatingSizes}
                                    className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700/50 text-sm font-semibold text-white appearance-none cursor-pointer focus:border-violet-500 outline-none hover:bg-slate-750 transition-colors disabled:opacity-50"
                                >
                                    {calculatingSizes ? (
                                        <option>Sizes...</option>
                                    ) : (
                                        qualities.map(q => (
                                            <option key={q.resolution} value={q.resolution}>
                                                {q.resolution}p {q.size ? `• ${q.size}` : ''}
                                            </option>
                                        ))
                                    )}
                                </select>
                            </div>
                        )}
                    </div>

                    {loading && (
                        <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 animate-in fade-in zoom-in-95 duration-300">
                             <div className="flex justify-between items-end mb-2 font-mono text-xs">
                                <span className="text-slate-300">
                                    {downloadDetails.total !== '...' && downloadDetails.total !== 'Calculating...' ? (
                                        <>
                                            {getDownloadedAmount()} <span className="text-slate-600 mx-1">/</span> {downloadDetails.total.replace('~', '')}
                                        </>
                                    ) : (
                                        <span className="animate-pulse">Starting...</span>
                                    )}
                                </span>
                                <span className="text-fuchsia-400">{downloadDetails.speed}</span>
                             </div>

                             <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden relative">
                                <div 
                                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-300 ease-out rounded-full"
                                    style={{ width: `${progress}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/30 w-full animate-[shimmer_2s_infinite]" 
                                         style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }}
                                    />
                                </div>
                             </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        {loading && (
                            <button 
                                onClick={handleCancel}
                                className="px-4 py-3 rounded-lg font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-95 transition-all"
                            >
                                <CancelIcon />
                            </button>
                        )}
                        
                        <button 
                            onClick={handleDownload} 
                            disabled={loading || (calculatingSizes && format === 'mp4')}
                            className={`flex-1 py-3 rounded-lg font-bold text-white shadow-lg transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 group relative overflow-hidden ${
                                loading 
                                ? 'bg-slate-700 cursor-not-allowed text-slate-400' 
                                : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-violet-900/30'
                            }`}
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                {loading ? `${Math.round(progress)}%` : <>Download <DownloadIcon /></>}
                            </span>
                        </button>
                    </div>

                </div>
            </div>
          )}

          <div className="h-6 mt-4 flex items-center justify-center">
              <p className={`text-[10px] uppercase tracking-widest font-semibold transition-colors duration-300 ${
                  status.includes('Error') || status.includes('Failed') ? 'text-red-400' : 'text-slate-600'
              }`}>
                {status !== 'Ready' && status}
              </p>
          </div>

        </div>
      </div>
      <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
    </div>
  );
};

export default Converter;