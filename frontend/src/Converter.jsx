/* frontend/src/Converter.jsx */
import { useState, useEffect, useRef } from 'react';

// --- CONFIG: Switches between localhost and Vercel automatically ---
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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
      // UPDATED: Use API_URL
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
      // UPDATED: Use API_URL
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

  /* ---------------- CANCEL ---------------- */
  const handleCancel = async () => {
    if (!currentRequestId) return;

    if (eventSourceRef.current) eventSourceRef.current.close();
    if (abortControllerRef.current) abortControllerRef.current.abort();

    try {
      // UPDATED: Use API_URL
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

  /* ---------------- DOWNLOAD ---------------- */
  const handleDownload = async () => {
    setLoading(true);
    setProgress(0);
    setStatus('Initializing...');
    setDownloadDetails({ total: 'Calculating...', speed: '0 MB/s' });

    const requestId = Date.now().toString();
    setCurrentRequestId(requestId);
    abortControllerRef.current = new AbortController();

    // UPDATED: Use API_URL
    const eventSource = new EventSource(`${API_URL}/events?requestId=${requestId}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.status === 'Downloading') {
        setProgress(data.progress);
        if (data.total !== '...') {
          setDownloadDetails({ total: data.total, speed: data.speed });
        }
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
      // UPDATED: Use API_URL
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

      if (response.status === 403) throw new Error("Security Alert: Internal/Private URLs are forbidden.");
      if (response.status === 429) throw new Error("Server busy. Please try again later.");
      
      if (!response.ok) throw new Error('Download failed');
      
      setStatus('Finalizing... (Sending file to browser)');
      
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

  /* ---------------- UI (EXACTLY YOUR ORIGINAL DESIGN) ---------------- */
  return (
    <div className="min-h-screen w-full bg-zinc-950 text-white flex justify-center px-6 py-24">
      <div className="w-full max-w-2xl">

        <h1 className="text-4xl font-semibold tracking-tight mb-4">
          Download media instantly
        </h1>
        <p className="text-zinc-400 mb-10">
          Paste a link to download video or audio in the best quality.
        </p>

        {/* INPUT */}
        <div className="relative mb-10">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste link here"
            className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-4 text-lg
                       placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-600/40"
          />
          {fetchingPreview && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="w-5 h-5 border-2 border-white/10 border-l-red-500 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* METADATA */}
        {metadata && (
          <div className="flex gap-5 items-center mb-10">
            <img
              src={metadata.thumbnail}
              className="w-36 h-20 object-cover rounded-lg border border-zinc-800"
            />
            <div>
              <h3 className="text-lg font-medium">{metadata.title}</h3>
              <p className="text-sm text-zinc-400">{metadata.uploader}</p>
            </div>
          </div>
        )}

        {/* OPTIONS */}
        {metadata && (
          <>
            <div className="flex gap-4 mb-10">
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="flex-1 rounded-lg bg-zinc-900 border border-zinc-800 p-3"
              >
                <option value="mp4">Video (MP4)</option>
                <option value="mp3">Audio (MP3)</option>
              </select>

              {format === 'mp4' && (
                <select
                  value={selectedQuality}
                  onChange={(e) => setSelectedQuality(e.target.value)}
                  className="w-40 rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-sm"
                >
                  {qualities.map(q => (
                    <option key={q.resolution} value={q.resolution}>
                      {q.resolution}p {q.size ? `(${q.size})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* PROGRESS BAR */}
            {loading && (
              <div className="mb-8">
                <div className="flex justify-between text-xs text-zinc-400 mb-2 font-mono">
                  <span>{getDownloadedAmount()} / {downloadDetails.total}</span>
                  <span>{downloadDetails.speed}</span>
                </div>
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-600 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* BUTTONS */}
            <div className="flex gap-3">
              {loading && (
                <button
                  onClick={handleCancel}
                  className="px-6 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleDownload}
                disabled={loading}
                className="flex-1 px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 font-semibold"
              >
                {loading ? `${Math.round(progress)}%` : 'Download'}
              </button>
            </div>
          </>
        )}

        <p className="mt-6 text-sm text-zinc-500">{status}</p>
      </div>
    </div>
  );
};

export default Converter;