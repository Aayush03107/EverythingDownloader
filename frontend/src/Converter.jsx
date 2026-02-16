import { useState, useEffect, useRef } from "react";

// --- CONFIG: Switches between localhost and Vercel automatically ---
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const Converter = () => {
  const [url, setUrl] = useState("");
  const [metadata, setMetadata] = useState(null);
  const [format, setFormat] = useState("mp4");

  // Playlist Specific State
  const [playlistVideos, setPlaylistVideos] = useState([]);
  const [selectedVideos, setSelectedVideos] = useState(new Set());
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [processingIndex, setProcessingIndex] = useState(-1);

  const [qualities, setQualities] = useState([
    { resolution: 1080, size: null },
    { resolution: 720, size: null },
    { resolution: 480, size: null },
    { resolution: 360, size: null },
  ]);
  const [selectedQuality, setSelectedQuality] = useState("1080");

  const [status, setStatus] = useState("Ready");
  const [loading, setLoading] = useState(false);
  const [calculatingSizes, setCalculatingSizes] = useState(false);
  const [fetchingPreview, setFetchingPreview] = useState(false);

  const [progress, setProgress] = useState(0);
  const [downloadDetails, setDownloadDetails] = useState({
    total: "...",
    speed: "...",
  });
  const [currentRequestId, setCurrentRequestId] = useState(null);

  const eventSourceRef = useRef(null);
  const abortControllerRef = useRef(null);

  /* ---------------- URL WATCH ---------------- */
  useEffect(() => {
    if (!url) {
      setMetadata(null);
      setPlaylistVideos([]);
      setIsPlaylist(false);
      resetQualities();
      setStatus("Ready");
      return;
    }

    const timer = setTimeout(() => {
      if (url.includes("list=") && url.includes("youtube")) {
        setIsPlaylist(true);
        fetchPlaylistInfo(url);
      } else if (url.includes("http")) {
        setIsPlaylist(false);
        fetchFastPreview(url);
        if (!url.includes("spotify")) fetchRealQualities(url);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [url]);

  const resetQualities = () => {
    setQualities([
      { resolution: 1080, size: null },
      { resolution: 720, size: null },
      { resolution: 480, size: null },
      { resolution: 360, size: null },
    ]);
    setCalculatingSizes(false);
  };

  const fetchPlaylistInfo = async (fetchUrl) => {
    setFetchingPreview(true);
    setStatus("Scanning playlist...");
    try {
      const res = await fetch(
        `${API_URL}/api/playlist?url=${encodeURIComponent(fetchUrl)}`,
      );
      const data = await res.json();
      if (data.videos) {
        setPlaylistVideos(data.videos);
        setSelectedVideos(new Set(data.videos.map((v) => v.id)));
        setStatus(`Found ${data.videos.length} videos in playlist`);
      }
    } catch (e) {
      setStatus("Error scanning playlist");
    } finally {
      setFetchingPreview(false);
    }
  };

  const fetchFastPreview = async (fetchUrl) => {
    setFetchingPreview(true);
    try {
      const res = await fetch(
        `${API_URL}/meta?url=${encodeURIComponent(fetchUrl)}`,
      );
      if (res.status === 403)
        throw new Error("Security Risk: This URL is blocked.");
      if (res.status === 429)
        throw new Error("Too many requests. Please wait.");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMetadata(data);
      setStatus("Ready to download");
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setFetchingPreview(false);
    }
  };

  const fetchRealQualities = async (fetchUrl) => {
    setCalculatingSizes(true);
    try {
      const res = await fetch(
        `${API_URL}/formats?url=${encodeURIComponent(fetchUrl)}`,
      );
      if (res.status === 429) return;
      const data = await res.json();
      if (data.formats) {
        const updated = [1080, 720, 480, 360].map(
          (r) =>
            data.formats.find((f) => f.resolution === r) || {
              resolution: r,
              size: null,
            },
        );
        setQualities(updated);
      }
    } catch (e) {
    } finally {
      setCalculatingSizes(false);
    }
  };

  /* ---------------- PLAYLIST SELECTION ---------------- */
  const toggleVideo = (id) => {
    if (loading) return;
    const newSet = new Set(selectedVideos);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedVideos(newSet);
  };

  const handleSelectAll = () => {
    if (selectedVideos.size === playlistVideos.length) {
      setSelectedVideos(new Set());
    } else {
      setSelectedVideos(new Set(playlistVideos.map((v) => v.id)));
    }
  };

  /* ---------------- DOWNLOAD LOGIC ---------------- */
  const handleDownloadAction = () => {
    if (isPlaylist) {
      startBatchDownload();
    } else {
      handleDownload(url, metadata?.title);
    }
  };

  const startBatchDownload = async () => {
    setLoading(true);
    const queue = playlistVideos.filter((v) => selectedVideos.has(v.id));

    for (let i = 0; i < queue.length; i++) {
      setProcessingIndex(playlistVideos.findIndex((v) => v.id === queue[i].id));
      setStatus(
        `Batch: ${i + 1}/${queue.length} - ${queue[i].title.substring(0, 20)}...`,
      );
      try {
        await handleDownload(queue[i].url, queue[i].title);
        // Small delay to prevent browser block
        await new Promise((r) => setTimeout(r, 1000));
      } catch (e) {
        console.error("Batch failure for:", queue[i].title);
      }
    }
    setLoading(false);
    setProcessingIndex(-1);
    setStatus("Batch download complete");
  };

  const handleDownload = async (targetUrl, targetTitle) => {
    if (!isPlaylist) setLoading(true);
    setProgress(0);
    setDownloadDetails({ total: "Calculating...", speed: "0 MB/s" });

    const requestId = Date.now().toString();
    setCurrentRequestId(requestId);
    abortControllerRef.current = new AbortController();

    return new Promise(async (resolve, reject) => {
      // 1. SETUP LISTENER
      const eventSource = new EventSource(
        `${API_URL}/events?requestId=${requestId}`,
      );
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.status === "Downloading") {
          setProgress(data.progress);
          if (data.total !== "...")
            setDownloadDetails({ total: data.total, speed: data.speed });
          if (!isPlaylist)
            setStatus(`Downloading ${Math.round(data.progress)}%`);
        } else if (data.status === "Complete") {
          setProgress(100);
          eventSource.close();

          // 3. PICKUP THE FILE (Redirect to GET route)
          if (!isPlaylist) setStatus("Download complete");
          if (!isPlaylist) setLoading(false);

          // Trigger file save
          window.location.href = `${API_URL}/download-file?requestId=${requestId}`;
          resolve();
        } else if (data.status === "Error") {
          eventSource.close();
          setStatus(`Error: ${data.message || "Failed"}`);
          reject(new Error(data.message || "Download failed"));
        }
      };

      // 2. START THE JOB
      try {
        const response = await fetch(`${API_URL}/convert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: targetUrl,
            format,
            quality: format === "mp4" ? selectedQuality : null,
            requestId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) throw new Error("Failed to start download");
        // Note: We DO NOT await blob() here. We wait for SSE 'Complete' instead.
      } catch (e) {
        if (e.name !== "AbortError") setStatus(`Failed: ${e.message}`);
        setLoading(false);
        if (eventSourceRef.current) eventSourceRef.current.close();
        reject(e);
      }
    });
  };

  const handleCancel = async () => {
    if (!currentRequestId) return;
    if (eventSourceRef.current) eventSourceRef.current.close();
    if (abortControllerRef.current) abortControllerRef.current.abort();
    try {
      await fetch(`${API_URL}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: currentRequestId }),
      });
    } catch {}
    setLoading(false);
    setProgress(0);
    setStatus("Cancelled");
    setCurrentRequestId(null);
    setProcessingIndex(-1);
  };

  const getDownloadedAmount = () => {
    const total = parseFloat(downloadDetails.total);
    if (isNaN(total)) return "0";
    return ((total * progress) / 100).toFixed(1);
  };

  /* ---------------- UI ---------------- */
  return (
    <div className="min-h-screen w-full bg-zinc-950 text-white flex justify-center px-6 py-24">
      <div className="w-full max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight mb-4">
          Download media instantly
        </h1>
        <p className="text-zinc-400 mb-10">
          Paste a link to download video, audio, or playlists in the best
          quality.
        </p>

        {/* INPUT */}
        <div className="relative mb-10">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste link here"
            className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-4 text-lg placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-600/40"
          />
          {fetchingPreview && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="w-5 h-5 border-2 border-white/10 border-l-red-500 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* PLAYLIST LIST VIEW */}
        {isPlaylist && playlistVideos.length > 0 && (
          <div className="mb-10 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm text-zinc-500">
                Select items to download ({selectedVideos.size})
              </p>
              <button
                onClick={handleSelectAll}
                className="text-xs font-medium text-red-500 hover:text-red-400 transition-colors uppercase tracking-wider"
              >
                {selectedVideos.size === playlistVideos.length
                  ? "Deselect All"
                  : "Select All"}
              </button>
            </div>

            <div className="bg-zinc-900 rounded-xl border border-zinc-800 max-h-72 overflow-y-auto custom-scrollbar">
              {playlistVideos.map((video, idx) => {
                const isSelected = selectedVideos.has(video.id);
                const isCurrent = processingIndex === idx;

                return (
                  <div
                    key={video.id}
                    onClick={() => toggleVideo(video.id)}
                    className={`p-4 border-b border-zinc-800/50 flex items-center gap-4 cursor-pointer hover:bg-zinc-800/30 transition-all ${isSelected ? "bg-red-600/5" : ""} ${isCurrent ? "border-l-4 border-red-600 bg-zinc-800/60" : ""}`}
                  >
                    {/* CHECKBOX UI */}
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center transition-all ${isSelected ? "bg-red-600 border-red-600" : "border border-zinc-700 bg-zinc-950"}`}
                    >
                      {isSelected && (
                        <svg
                          className="w-3.5 h-3.5 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="4"
                        >
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>

                    <span
                      className={`text-sm truncate flex-1 font-medium ${isSelected ? "text-zinc-100" : "text-zinc-500"}`}
                    >
                      {video.title}
                    </span>

                    {isCurrent && (
                      <span className="text-[10px] font-bold text-red-500 animate-pulse uppercase">
                        Active
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SINGLE METADATA */}
        {!isPlaylist && metadata && (
          <div className="flex gap-5 items-center mb-10 animate-in fade-in">
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

        {/* OPTIONS & ACTION */}
        {(metadata || (isPlaylist && playlistVideos.length > 0)) && (
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

              {format === "mp4" && (
                <select
                  value={selectedQuality}
                  onChange={(e) => setSelectedQuality(e.target.value)}
                  className="w-40 rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-sm"
                >
                  {qualities.map((q) => (
                    <option key={q.resolution} value={q.resolution}>
                      {q.resolution}p {q.size ? `(${q.size})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {loading && (
              <div className="mb-8 animate-in slide-in-from-top-2">
                <div className="flex justify-between text-xs text-zinc-400 mb-2 font-mono">
                  <span>
                    {getDownloadedAmount()} / {downloadDetails.total}
                  </span>
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

            <div className="flex gap-3">
              {loading && (
                <button
                  onClick={handleCancel}
                  className="px-6 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleDownloadAction}
                disabled={loading || (isPlaylist && selectedVideos.size === 0)}
                className="flex-1 px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] cursor-pointer"
              >
                {loading
                  ? isPlaylist
                    ? `Processing Batch...`
                    : `${Math.round(progress)}%`
                  : isPlaylist
                    ? `Download ${selectedVideos.size} Items`
                    : "Download"}
              </button>
            </div>
          </>
        )}

        <p className="mt-6 text-sm text-zinc-500">{status}</p>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #ef4444; }
      `}</style>
    </div>
  );
};

export default Converter;
