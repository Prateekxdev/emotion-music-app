import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Bookmark, Camera, ChevronDown, Disc3, ExternalLink, Heart, Headphones, History as HistoryIcon, ListMusic, LoaderCircle, LogIn, LogOut, Moon, Music2, Plus, Radio, ShieldCheck, Sparkles, Sun, Trash2, Upload, Waves, X } from "lucide-react";
import TrackCard from "./components/TrackCard.jsx";
import AccountDialog from "./components/AccountDialog.jsx";
import TrackFilters from "./components/TrackFilters.jsx";
import TrackSkeletonGrid from "./components/TrackSkeletonGrid.jsx";
import { api } from "./lib/api.js";
import { readStored, writeStored } from "./lib/storage.js";

const genres = ["Let the mood decide", "Pop", "Rock", "Acoustic", "Electronic", "Lo-fi", "Jazz", "Classical", "Hip-hop", "Indie"];
const goals = ["Match my mood", "Lift my mood", "Help me relax"];
const emotions = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"];
const languages = ["No preference", "English", "Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "Punjabi", "Bengali", "Marathi", "Gujarati", "Urdu", "Korean", "Japanese", "Spanish", "French", "Arabic", "Instrumental / no vocals"];
const moodCopy = {
  happy: ["Keep that light going.", "SUNLIT & UPBEAT"], sad: ["A little company for the quiet.", "SOFT & UNDERSTANDING"],
  angry: ["Let the energy move through.", "BOLD & UNFILTERED"], neutral: ["Find your own easy rhythm.", "CALM & CENTERED"],
  surprise: ["Follow that unexpected spark.", "BRIGHT & ELECTRIC"], fear: ["Take a breath. You’re here.", "GENTLE & STEADY"],
  disgust: ["Make space for a reset.", "FRESH & GROUNDED"],
};
const sampleTracks = [["Golden", "Harry Styles"], ["Sunflower", "Post Malone & Swae Lee"], ["Good as Hell", "Lizzo"], ["Levitating", "Dua Lipa"]].map(([title, artist]) => ({
  title, artist, isFallback: true, mood: "happy", language: "English", reason: "A bright sample for your first listen",
  url: `https://music.youtube.com/search?q=${encodeURIComponent(`${title} ${artist}`)}`,
}));

function EntryScreen() {
  return <main className="entry-screen" role="status" aria-label="Loading Moodwave" aria-busy="true">
    <img src="/assets/moodwave-logo.png" alt="Moodwave music logo" decoding="async" />
    <span className="entry-loading" aria-hidden="true" />
  </main>;
}

function MoodChoices({ value, onChange, label, className = "" }) {
  return <div className={`field mood-choice-field ${className}`}>
    <span>{label}</span>
    <div className="mood-choice-grid" role="group" aria-label={label}>
      {emotions.map((emotion) => <button
        className={`mood-choice ${value === emotion ? "selected" : ""}`}
        data-mood={emotion}
        key={emotion}
        type="button"
        aria-pressed={value === emotion}
        onClick={() => onChange(emotion)}
      >{emotion === "neutral" ? "Calm" : emotion[0].toUpperCase() + emotion.slice(1)}</button>)}
    </div>
  </div>;
}

export default function App() {
  const [entryLoading, setEntryLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [genre, setGenre] = useState(genres[0]);
  const [goal, setGoal] = useState(goals[0]);
  const [language, setLanguage] = useState("No preference");
  const [moodResult, setMoodResult] = useState(null);
  const [selectedMood, setSelectedMood] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [favorites, setFavorites] = useState([]);
  const [favoritesStatus, setFavoritesStatus] = useState("loading");
  const [favoritesError, setFavoritesError] = useState("");
  const [serviceHealth, setServiceHealth] = useState({ python: null, mongo: null });
  const [activeTab, setActiveTab] = useState("mix");
  const [historyActive, setHistoryActive] = useState(false);
  const [history, setHistory] = useState(() => {
    const stored = readStored("moodwave_history", []);
    return Array.isArray(stored) ? stored.slice(0, 20) : [];
  });
  const [feedback, setFeedback] = useState(() => {
    const stored = readStored("moodwave_feedback", {});
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  });
  const [nowPlaying, setNowPlaying] = useState(null);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const [manualMood, setManualMood] = useState("");
  const [account, setAccount] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [playlistName, setPlaylistName] = useState("");
  const [playbackQueue, setPlaybackQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [privacyMessage, setPrivacyMessage] = useState("");
  const [theme, setTheme] = useState(() => readStored("moodwave_theme", "light") === "dark" ? "dark" : "light");
  const [authInitialMode, setAuthInitialMode] = useState("login");
  const [authResetToken, setAuthResetToken] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [filterMood, setFilterMood] = useState("any");
  const [filterLanguage, setFilterLanguage] = useState("any");
  const playerCloseRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setEntryLoading(false), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const refreshHealth = async () => {
      try {
        const health = await api("/api/health", {}, 12000);
        if (active) setServiceHealth({ python: Boolean(health.python), model: Boolean(health.model), mongo: Boolean(health.mongo) });
      } catch {
        if (active) setServiceHealth({ python: false, model: false, mongo: false });
      }
    };
    refreshHealth();
    const interval = window.setInterval(refreshHealth, 30000);
    api("/api/auth/me", {}, 6000).then(async (profile) => {
      if (!active) return;
      setAccount(profile.user);
      setFeedback(feedbackToMap(profile.feedback));
      setHistory(Array.isArray(profile.history) ? profile.history : []);
      setProfileReady(true);
      const [savedResult, playlistResult] = await Promise.allSettled([api("/api/favorites", {}, 6000), api("/api/playlists", {}, 6000)]);
      if (!active) return;
      if (savedResult.status === "fulfilled") { setFavorites(savedResult.value); setFavoritesStatus("ready"); }
      else { setFavoritesStatus("unavailable"); setFavoritesError(savedResult.reason.message); }
      if (playlistResult.status === "fulfilled") setPlaylists(playlistResult.value);
    }).catch(() => { if (active) { setFavorites([]); setFavoritesStatus("signedout"); } });
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    if (cameraOpen && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOpen, cameraStream]);

  useEffect(() => () => cameraStream?.getTracks().forEach((track) => track.stop()), [cameraStream]);
  useEffect(() => {
    writeStored("moodwave_history", history);
    writeStored("moodwave_feedback", feedback);
    if (!account || !profileReady) return undefined;
    const timer = window.setTimeout(() => api("/api/profile", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: history.slice(0, 100), feedback: Object.values(feedback).slice(0, 500) }),
    }, 10000).catch((err) => setPrivacyMessage(err.message)), 700);
    return () => window.clearTimeout(timer);
  }, [history, feedback, account, profileReady]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#211d29" : "#f5f4f0");
    writeStored("moodwave_theme", theme);
  }, [theme]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyToken = params.get("verify");
    const resetToken = params.get("reset");
    if (!verifyToken && !resetToken) return;
    params.delete("verify"); params.delete("reset");
    const cleanUrl = `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", cleanUrl);
    if (verifyToken) {
      api("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: verifyToken }) })
        .then(() => { setAuthNotice("Email verified. Sign in to continue."); setAuthInitialMode("login"); setAccountOpen(true); })
        .catch((err) => setAuthNotice(err.message));
    }
    if (resetToken) { setAuthResetToken(resetToken); setAuthInitialMode("reset"); setAccountOpen(true); }
  }, []);

  useEffect(() => {
    if (!nowPlaying) return undefined;
    previousFocusRef.current = document.activeElement;
    playerCloseRef.current?.focus();
    const handleKeyDown = (event) => { if (event.key === "Escape") setNowPlaying(null); };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [nowPlaying]);

  const mood = (selectedMood || moodResult?.emotion || result?.emotion)?.toLowerCase();
  const copy = moodCopy[mood] || ["A soundtrack for right now.", "YOUR PERSONAL MIX"];
  const savedUrlSet = useMemo(() => new Set(favorites.map((song) => song.url)), [favorites]);
  const filteredFavorites = favorites.filter(matchesLibraryFilters);
  const feedbackEntries = Object.values(feedback).filter((item) => item && typeof item === "object");
  const likedCount = feedbackEntries.filter((item) => item.vote === "up").length;
  const dislikedCount = feedbackEntries.filter((item) => item.vote === "down").length;

  async function refreshFavorites() {
    setFavoritesStatus("loading");
    setFavoritesError("");
    try {
      setFavorites(await api("/api/favorites", {}, 6000));
      setFavoritesStatus("ready");
    } catch (err) {
      setFavoritesStatus("unavailable");
      setFavoritesError(err.message);
    }
  }

  function choosePhoto(nextFile) {
    if (!nextFile) return;
    if (!/^image\/(jpeg|png|webp)$/.test(nextFile.type)) {
      setFile(null);
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setFile(null);
      setError("That image is over 10 MB. Choose a smaller photo.");
      return;
    }
    closeCamera();
    setFile(nextFile); setMoodResult(null); setSelectedMood(""); setResult(null); setError(""); setActiveTab("mix");
  }

  async function openCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is unavailable here. Open the app on localhost or HTTPS, or choose a photo instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      setCameraStream(stream);
      setCameraOpen(true);
    } catch (err) {
      const message = err.name === "NotAllowedError"
        ? "Camera permission was blocked. Allow camera access in your browser settings, or choose a photo instead."
        : "We couldn't open the camera. Check that it is connected and not being used by another app.";
      setError(message);
    }
  }

  function closeCamera() {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setCameraOpen(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) {
      setError("The camera is still starting. Wait a moment and try again.");
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) { setError("We couldn't capture that photo. Please try again."); return; }
      choosePhoto(new File([blob], "mood-check.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  async function detectMood(event) {
    event.preventDefault();
    if (!file) { setError("Add a photo first so we can read the mood."); return; }
    setBusy(true); setError("");
    try {
      const body = new FormData();
      body.append("photo", file);
      const detected = await api("/api/detect", { method: "POST", body }, 65000);
      setMoodResult(detected);
      setSelectedMood(detected.emotion);
      setResult(null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function makeMix() {
    if (!mood) return;
    setBusy(true); setError("");
    try {
      const newestFirst = (vote) => feedbackEntries
        .filter((item) => item.vote === vote && item.track && typeof item.track === "object")
        .sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
      const likedTracks = newestFirst("up").map((item) => item.track).slice(0, 5);
      const dislikedTracks = newestFirst("down").map((item) => item.track).slice(0, 10);
      const mix = await api("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emotion: mood,
          genre,
          goal,
          language,
          likedTracks,
          dislikedTracks,
          dislikedIds: dislikedTracks.map((track) => track.videoId).filter(Boolean),
        }),
      }, 25000);
      setResult(mix);
      const entry = { id: `${Date.now()}`, at: new Date().toISOString(), emotion: mood, language, genre, tracks: (mix.tracks || []).map(({ title, artist, url }) => ({ title, artist, url })) };
      setHistory((items) => [entry, ...items].slice(0, 20));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function rateTrack(track, vote) {
    if (!track.url) return;
    let videoId = null;
    try { videoId = new URL(track.url).searchParams.get("v"); } catch { /* ignore malformed provider links */ }
    setFeedback((current) => ({ ...current, [track.url]: { vote, at: new Date().toISOString(), track: { title: track.title, artist: track.artist, url: track.url, videoId } } }));
  }

  function clearHistory() { setHistory([]); setPrivacyMessage("Listening history cleared."); }

  async function saveTrack(track) {
    if (!track.url) return;
    try {
      const saved = await api("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...track, mood: track.mood || mood || "", language: track.language || language }) });
      setFavorites((current) => [saved, ...current.filter((item) => item.url !== saved.url)]);
      setFavoritesStatus("ready");
    } catch (err) { setError(err.message); }
  }

  async function removeTrack(song) {
    try {
      await api(`/api/favorites/${song._id}`, { method: "DELETE" });
      setFavorites((items) => items.filter((item) => item._id !== song._id));
      setFavoritesStatus("ready");
    } catch (err) { setError(err.message); }
  }

  async function acceptAccount(profile) {
    setAccount(profile.user);
    setFeedback(feedbackToMap(profile.feedback));
    setHistory(Array.isArray(profile.history) ? profile.history : []);
    setProfileReady(true);
    try {
      const [saved, lists] = await Promise.all([api("/api/favorites"), api("/api/playlists")]);
      setFavorites(saved); setPlaylists(lists); setFavoritesStatus("ready");
    } catch (err) { setFavoritesStatus("unavailable"); setFavoritesError(err.message); }
  }

  async function signOut() {
    try { await api("/api/auth/logout", { method: "POST" }); } catch { /* The session can still expire naturally. */ }
    setAccount(null); setProfileReady(false); setFavorites([]); setPlaylists([]); setFavoritesStatus("signedout");
    setFeedback({}); setHistory([]); setPrivacyMessage("You are signed out.");
  }

  async function createPlaylist(event) {
    event.preventDefault();
    if (!playlistName.trim()) return;
    try {
      const created = await api("/api/playlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: playlistName }) });
      setPlaylists((items) => [created, ...items]); setPlaylistName(""); setPrivacyMessage(`Created “${created.name}”.`);
    } catch (err) { setError(err.message); }
  }

  async function addToPlaylist(playlistId, track) {
    try {
      const updated = await api(`/api/playlists/${playlistId}/tracks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ track: { ...track, mood: track.mood || mood || "", language: track.language || language } }) });
      setPlaylists((items) => items.map((item) => item._id === updated._id ? updated : item));
    } catch (err) { setError(err.message); }
  }

  async function deletePlaylist(playlist) {
    try { await api(`/api/playlists/${playlist._id}`, { method: "DELETE" }); setPlaylists((items) => items.filter((item) => item._id !== playlist._id)); }
    catch (err) { setError(err.message); }
  }

  async function deleteAccount() {
    if (!window.confirm("Permanently delete your Moodwave account, playlists, saved tracks, feedback, and listening history? This cannot be undone.")) return;
    try {
      await api("/api/account", { method: "DELETE" });
      setAccount(null); setProfileReady(false); setFavorites([]); setPlaylists([]); setFavoritesStatus("signedout");
      setFeedback({}); setHistory([]); writeStored("moodwave_feedback", {}); writeStored("moodwave_history", []);
      setPrivacyMessage("Your account and its saved data were deleted.");
    } catch (err) { setError(err.message); }
  }

  function playTrack(track, tracks = visibleTracks) {
    const playableTracks = tracks.filter((item) => item?.url);
    const index = Math.max(0, playableTracks.findIndex((item) => item.url === track.url));
    setPlaybackQueue(playableTracks); setQueueIndex(index); setNowPlaying(track); setPlayerExpanded(false);
    setHistory((items) => [{ id: `play-${Date.now()}`, at: new Date().toISOString(), emotion: mood || "saved", language, genre, tracks: [{ title: track.title, artist: track.artist, url: track.url }] }, ...items].slice(0, 100));
  }

  function moveQueue(direction) {
    if (!playbackQueue.length) return;
    const next = (queueIndex + direction + playbackQueue.length) % playbackQueue.length;
    setQueueIndex(next); setNowPlaying(playbackQueue[next]);
  }

  function matchesLibraryFilters(track) {
    const query = librarySearch.trim().toLocaleLowerCase();
    const matchesText = !query || `${track.title || ""} ${track.artist || ""}`.toLocaleLowerCase().includes(query);
    const trackMood = String(track.mood || track.emotion || "").toLocaleLowerCase();
    const trackLanguage = String(track.language || "").toLocaleLowerCase();
    return matchesText && (filterMood === "any" || trackMood === filterMood) && (filterLanguage === "any" || trackLanguage === filterLanguage.toLocaleLowerCase());
  }

  function showSampleMix() {
    setSelectedMood("happy"); setManualMood("happy"); setMoodResult({ emotion: "happy", manual: true });
    setResult({ emotion: "happy", tracks: sampleTracks, source: "sample", personalized: false });
    setActiveTab("mix");
  }

  const visibleTracks = activeTab === "mix" ? result?.tracks || [] : favorites;

  return <>
  <div className="app-shell" data-theme={theme} data-mood={mood || "neutral"}>
    <aside className="sidebar">
      <a className="brand" href="#top" aria-label="Moodwave home"><span className="brand-mark"><Waves size={21}/></span><span>moodwave<span className="brand-dot">.</span></span></a>
      <div className="side-label">YOUR SPACE</div>
      <button className={`side-link ${activeTab === "mix" ? "selected" : ""}`} onClick={() => { setActiveTab("mix"); setHistoryActive(false); }}><AudioLines size={18}/> Discover <span className="side-active"/></button>
      <button className={`side-link ${activeTab === "saved" ? "selected" : ""}`} onClick={() => { setActiveTab("saved"); setHistoryActive(false); }}><Bookmark size={18}/> Saved tracks {favorites.length > 0 && <span className="count-pill">{favorites.length}</span>}</button>
      <button className={`side-link ${activeTab === "playlists" ? "selected" : ""}`} onClick={() => { setActiveTab("playlists"); setHistoryActive(false); }}><ListMusic size={18}/> Playlists</button>
      <button className="side-link history-link" onClick={() => { setActiveTab("mix"); setHistoryActive(true); setTimeout(() => document.getElementById("listening-history")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 0); }}><HistoryIcon size={18}/> Listening history</button>
      <div className="sidebar-note"><div className="note-icon"><Sparkles size={16}/></div><strong>Music meets mood.</strong><p>A small check-in can change the whole soundtrack.</p></div>
      <div className="sidebar-bottom"><span className={`live-dot ${serviceHealth.mongo ? "" : "status-muted"}`}/> {serviceHealth.mongo ? "Library connected" : serviceHealth.mongo === null ? "Checking library" : "Library offline"}<span className="version">v1.0</span></div>
    </aside>

    <main id="top" className="main-content">
      <header className="topbar"><div className="breadcrumb"><span>YOUR LISTENING SPACE</span><span className="crumb-divider">/</span><b>{activeTab === "mix" ? "Discover" : activeTab === "saved" ? "Saved tracks" : "Playlists"}</b></div><div className="top-right"><span className={`status-dot ${serviceHealth.python === false || serviceHealth.model === false ? "service-offline" : ""}`} aria-hidden="true"/><span aria-live="polite">{serviceHealth.python === null ? "Checking music service" : !serviceHealth.python ? "Music service offline" : !serviceHealth.model ? "Photo detection unavailable" : "Mood and music online"}</span><button className="theme-toggle" type="button" onClick={() => setTheme((current) => current === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>{theme === "light" ? <Moon size={15}/> : <Sun size={15}/>}<span>{theme === "light" ? "Dark" : "Light"}</span></button>{account ? <><span className="account-email">{account.email}</span><button className="account-action" onClick={signOut}><LogOut size={14}/> Sign out</button></> : <button className="account-action" onClick={() => setAccountOpen(true)}><LogIn size={14}/> Sign in</button>}</div></header>

      <section className="welcome-row"><div><div className="overline"><span className="overline-line"/> A SOUNDTRACK FOR RIGHT NOW</div><h1>How are you <span>feeling?</span></h1><p className="intro">Pick a mood to start—no photo needed. A photo check-in is optional.</p></div><div className="hero-disc"><div className="disc-rings"><span/><span/><span/><i><Music2 size={22}/></i></div><div className="disc-spark spark-one">✦</div><div className="disc-spark spark-two">✧</div></div></section>
      {authNotice && <div className="auth-notice" role="status">{authNotice}<button onClick={() => setAuthNotice("")} aria-label="Dismiss message"><X size={14}/></button></div>}

      {activeTab === "mix" ? <><div className="workspace-grid">
        <section className="checkin-card panel">
          <div className="card-heading"><div><span className="step-tag">OPTIONAL PHOTO CHECK-IN</span><h2>Read the room</h2><p>Prefer a suggestion? A photo can estimate your mood.</p></div><div className="heading-icon"><Camera size={19}/></div></div>
          <form onSubmit={detectMood}>
            {cameraOpen ? <div className="camera-live"><video ref={videoRef} autoPlay muted playsInline/><div className="camera-controls"><span><span className="camera-live-dot"/> CAMERA ON</span><button type="button" onClick={capturePhoto}><Camera size={15}/> Capture photo</button><button type="button" className="camera-cancel" onClick={closeCamera}>Cancel</button></div></div> : <>
              <label className={`dropzone ${preview ? "has-preview" : ""}`}>
                {preview ? <><img src={preview} alt="Your selected portrait"/><span className="photo-change"><Camera size={14}/> Change photo</span></> : <><span className="upload-icon"><Upload size={21}/></span><strong>Choose a photo, or open the camera</strong><span>JPG, PNG or WebP · up to 10 MB</span><em>Browse files</em></>}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { choosePhoto(event.target.files?.[0]); event.target.value = ""; }}/>
              </label>
              <div className="privacy-note"><ShieldCheck size={15}/><span><strong>Private by design.</strong> Photos are analyzed for mood and never stored.</span></div>
              <div className="camera-launch-row"><span>For the full mood check-in</span><button type="button" onClick={openCamera}><Camera size={15}/> Open camera</button></div>
            </>}
            {cameraOpen && <div className="privacy-note"><ShieldCheck size={15}/><span><strong>Private by design.</strong> Photos are analyzed for mood and never stored.</span></div>}
            <canvas ref={canvasRef} className="capture-canvas" aria-hidden="true"/>
            <button className="primary-button" disabled={busy || !file}>{busy ? <><LoaderCircle className="spin" size={18}/> Reading your mood...</> : <><Sparkles size={17}/> {moodResult ? "Detect my mood again" : "Detect my mood"} <span>→</span></>}</button>
          </form>
          {error && <div className="error-banner" role="alert"><span>!</span>{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={15}/></button></div>}
          <div className="soft-disclaimer">An AI estimate, not a diagnosis. Your feelings are yours to name.</div>
        </section>

        <section className="mix-panel">
          <div className="mix-header"><div><span className="step-tag">02 / YOUR SOUNDTRACK</span><h2>{result ? "Made for this moment" : moodResult ? "Mood detected" : "Your mix is waiting"}</h2></div>{result && <div className="live-pill"><span/> {result.personalized ? "TASTE MATCH" : result.source === "youtube_music" ? "LIVE PICKS" : result.source === "unavailable" ? "NO RESULTS" : "MOOD PICKS"}</div>}</div>
          {moodResult ? <>
            <div className="mood-summary"><div className="mood-orb"><Waves size={22}/></div><div><span className="mood-label">{moodResult.manual ? "YOUR MOOD" : "DETECTED MOOD"}</span><strong>{mood}</strong><small>{copy[0]}</small></div>{!moodResult.manual && <div className="confidence"><span>MODEL CONFIDENCE</span><b>{Math.round(moodResult.confidence * 100)}%</b></div>}</div>
            {!moodResult.manual && moodResult.confidence < 0.5 && <div className="confidence-hint">The model is unsure. Choose the mood that feels right to you.</div>}
            <MoodChoices className="mood-override" label="USE THIS MOOD FOR MUSIC" value={mood} onChange={(value) => { setSelectedMood(value); setResult(null); }}/>
            <div className="language-preferences">
              <div className="preference-heading"><span className="step-tag">03 / PERSONALISE YOUR MIX</span><span>Choose how you want to hear it</span></div>
              <label className="field language-field"><span>SONG LANGUAGE</span><div className="select-wrap"><span className="language-glyph">文</span><select value={language} onChange={(event) => { setLanguage(event.target.value); setResult(null); }}>{languages.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15}/></div></label>
              <div className="field-row preference-row"><label className="field"><span>YOUR SOUND</span><div className="select-wrap"><Disc3 size={16}/><select value={genre} onChange={(event) => { setGenre(event.target.value); setResult(null); }}>{genres.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15}/></div></label><label className="field"><span>THE FEELING</span><div className="select-wrap"><Radio size={16}/><select value={goal} onChange={(event) => { setGoal(event.target.value); setResult(null); }}>{goals.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15}/></div></label></div>
              <button className="find-songs-button" type="button" onClick={makeMix} disabled={busy}>{busy ? <><LoaderCircle className="spin" size={16}/> Finding songs...</> : <><Sparkles size={15}/> {Object.values(feedback).length ? "Refresh with my feedback" : `Find ${language === "No preference" ? "songs" : `${language} songs`}`} <span>→</span></>}</button>
            </div>
            {busy && !result && <TrackSkeletonGrid count={4}/>}
            {result && (result.tracks.length > 0 ? <>
              <div className="track-list recommendation-grid" aria-live="polite" aria-busy={busy}>{busy ? <TrackSkeletonGrid count={4}/> : visibleTracks.map((track, index) => <TrackCard key={track.url || `${track.title}-${index}`} track={track} index={index} card saved={savedUrlSet.has(track.url)} onSave={account ? saveTrack : undefined} playlists={account ? playlists : []} onAddToPlaylist={account ? addToPlaylist : undefined} feedbackValue={feedback[track.url]?.vote} onFeedback={rateTrack} onPlay={(item) => playTrack(item, visibleTracks)}/>)}</div>
              <div className="mix-foot"><span><span className="tiny-live"/> {result.personalized ? "Ranked using your recent likes and dislikes" : result.source === "youtube_music" ? `Live ${language === "No preference" ? "music" : `${language} music`} results` : "Showing built-in suggestions"}</span><span>{result.tracks.length} tracks</span></div>
              {!account && <button className="account-nudge" onClick={() => setAccountOpen(true)}>Sign in to save songs, create playlists, and sync feedback</button>}
              <section className="taste-profile"><div><span className="step-tag">YOUR FEEDBACK PROFILE</span><strong>{likedCount + dislikedCount ? "Your next mix is learning your taste" : "Teach your next mix what you like"}</strong><p>{likedCount} liked · {dislikedCount} skipped <span>{account ? "Feedback syncs to your account." : "Sign in to sync feedback across devices."}</span></p></div>{likedCount + dislikedCount > 0 && <button type="button" onClick={() => setFeedback({})}>Clear feedback</button>}</section>
            </> : <div className="no-tracks"><Music2 size={18}/><span>{language === "No preference" ? "No matches came back this time. Try another language or style." : `No ${language} tracks came back this time. Try another language or style.`}</span></div>)}
          </> : <div className="empty-mix"><div className="empty-art"><div className="empty-vinyl"><span/></div><span className="empty-note note-a">♫</span><span className="empty-note note-b">♫</span></div><strong>Your next favorite is out there.</strong><p>Choose a mood to build a mix—no photo required.</p><div className="manual-mood-start"><MoodChoices label="CHOOSE YOUR MOOD" value={manualMood} onChange={setManualMood}/><button className="find-songs-button" type="button" disabled={!manualMood} onClick={() => { setSelectedMood(manualMood); setMoodResult({ emotion: manualMood, manual: true }); }}><Sparkles size={15}/> Continue with this mood <span>→</span></button></div><button className="sample-mix-button" type="button" onClick={showSampleMix}><AudioLines size={15}/> Preview a sample mix</button><div className="empty-tags"><span><Sparkles size={13}/> Personalised</span><span><ExternalLink size={13}/> Ready to play</span></div></div>}
        </section>
      </div>
      <section className="history-panel panel" id="listening-history">
        <div className="history-heading"><div><span className="step-tag">{account ? "YOUR PRIVATE HISTORY" : "KEPT ON THIS DEVICE"}</span><h2>Listening history</h2></div>{history.length > 0 && <button className="clear-history" onClick={clearHistory}><Trash2 size={14}/> Clear history</button>}</div>
        {history.length ? <div className="history-list">{history.map((entry) => <article className="history-entry" key={entry.id}><div className="history-entry-head"><strong>{entry.emotion}</strong><span>{entry.language} · {entry.genre}</span><time>{new Date(entry.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div><div className="history-tracks">{entry.tracks.slice(0, 4).map((track) => track.url ? <button key={track.url} onClick={() => playTrack(track, entry.tracks)}>{track.title} <span>· {track.artist}</span></button> : <span key={track.title}>{track.title} · {track.artist}</span>)}</div></article>)}</div> : <p className="history-empty">Your recent mood mixes will appear here. {account ? "History syncs to your private account." : "History stays in this browser until you sign in."}</p>}
      </section>
      </> : activeTab === "playlists" ? <section className="saved-page panel"><div className="card-heading"><div><span className="step-tag">YOUR MIXTAPES</span><h2>Playlists</h2><p>Keep the songs you want to hear together.</p></div><div className="heading-icon"><ListMusic size={19}/></div></div>{account && <TrackFilters query={librarySearch} setQuery={setLibrarySearch} mood={filterMood} setMood={setFilterMood} language={filterLanguage} setLanguage={setFilterLanguage}/>} {!account ? <div className="saved-empty"><strong>Sign in to create private playlists</strong><span>Playlists sync to your account across devices.</span><button className="clear-history" onClick={() => setAccountOpen(true)}>Sign in or create account</button></div> : <><form className="create-playlist-form" onSubmit={createPlaylist}><input aria-label="New playlist name" placeholder="Name your playlist" maxLength={80} value={playlistName} onChange={(event) => setPlaylistName(event.target.value)}/><button className="clear-history" disabled={!playlistName.trim()}><Plus size={14}/> Create playlist</button></form>{playlists.length ? <div className="playlist-stack">{playlists.map((playlist) => <article className="playlist-card" key={playlist._id}><div className="playlist-title"><div><strong>{playlist.name}</strong><span>{playlist.tracks.length} songs</span></div><button className="clear-history" onClick={() => deletePlaylist(playlist)} aria-label={`Delete ${playlist.name}`}><Trash2 size={14}/> Delete</button></div>{playlist.tracks.filter(matchesLibraryFilters).length ? <div className="track-list">{playlist.tracks.filter(matchesLibraryFilters).map((track, index) => <div className="saved-row" key={track.url}><TrackCard track={track} index={index} onPlay={(item) => playTrack(item, playlist.tracks)}/><button className="remove-button" aria-label={`Remove ${track.title} from ${playlist.name}`} onClick={async () => { try { const updated = await api(`/api/playlists/${playlist._id}/tracks`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: track.url }) }); setPlaylists((items) => items.map((item) => item._id === updated._id ? updated : item)); } catch (err) { setError(err.message); } }}><X size={16}/></button></div>)}</div> : <p className="history-empty">{playlist.tracks.length ? "No songs match these filters." : "Add songs from your recommendations using the playlist selector."}</p>}</article>)}</div> : <div className="saved-empty"><ListMusic size={23}/><strong>No playlists yet</strong><span>Create one, then add songs from any recommendation.</span></div>}</>}</section> : <section className="saved-page panel"><div className="card-heading"><div><span className="step-tag">YOUR COLLECTION</span><h2>Saved tracks</h2><p>Your little shelf of songs to come back to.</p></div><div className="heading-icon"><Heart size={19}/></div></div>{account && <TrackFilters query={librarySearch} setQuery={setLibrarySearch} mood={filterMood} setMood={setFilterMood} language={filterLanguage} setLanguage={setFilterLanguage}/>} {!account ? <div className="saved-empty"><strong>Sign in for a private music library</strong><span>Saved songs are private to your account.</span><button className="clear-history" onClick={() => setAccountOpen(true)}>Sign in or create account</button></div> : favoritesStatus === "loading" ? <TrackSkeletonGrid count={4} rows/> : filteredFavorites.length ? <div className="track-list">{filteredFavorites.map((track, index) => <div className="saved-row" key={track._id}><TrackCard track={track} index={index} onPlay={(item) => playTrack(item, favorites)} playlists={playlists} onAddToPlaylist={addToPlaylist}/><button className="remove-button" onClick={() => removeTrack(track)} aria-label={`Remove ${track.title}`}><X size={16}/></button></div>)}</div> : favoritesStatus === "unavailable" && serviceHealth.mongo ? <div className="saved-empty"><strong>Couldn’t load your library</strong><span>{favoritesError}</span><button className="clear-history" onClick={refreshFavorites}>Try again</button></div> : <div className="saved-empty"><Bookmark size={25}/><strong>{favorites.length ? "No saved songs match these filters" : "No saved tracks yet"}</strong><span>Your saved songs will live here.</span></div>}<section className="privacy-settings"><span className="step-tag">PRIVACY AND DATA</span><h3>Your Moodwave data</h3><p>Photos are processed for mood detection and aren’t stored. You can clear your local activity or permanently remove your account and its playlists, saved songs, feedback, and history.</p><div className="privacy-actions"><button className="clear-history" onClick={() => { setFeedback({}); setHistory([]); writeStored("moodwave_feedback", {}); writeStored("moodwave_history", []); setPrivacyMessage("Feedback and listening history cleared."); }}>Clear feedback and history</button>{account && <button className="delete-account-button" onClick={deleteAccount}>Delete account and all data</button>}</div>{privacyMessage && <p className="privacy-message" role="status">{privacyMessage}</p>}</section></section>}

      <nav className="mobile-nav" aria-label="Primary navigation"><button aria-current={!historyActive && activeTab === "mix" ? "page" : undefined} onClick={() => { setActiveTab("mix"); setHistoryActive(false); }}><AudioLines size={18}/><span>Discover</span></button><button aria-current={activeTab === "saved" ? "page" : undefined} onClick={() => { setActiveTab("saved"); setHistoryActive(false); }}><Bookmark size={18}/><span>Saved</span></button><button aria-current={activeTab === "playlists" ? "page" : undefined} onClick={() => { setActiveTab("playlists"); setHistoryActive(false); }}><ListMusic size={18}/><span>Playlists</span></button><button aria-current={historyActive ? "location" : undefined} onClick={() => { setActiveTab("mix"); setHistoryActive(true); window.setTimeout(() => document.getElementById("listening-history")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 0); }}><HistoryIcon size={18}/><span>History</span></button></nav>
      <footer className="page-footer"><span>MOODWAVE <span className="footer-dot">●</span> MUSIC FOR YOUR MOMENT</span><span>Take what you need. Leave what you don’t.</span></footer>
    </main>
    {nowPlaying && <section className={`mini-player ${playerExpanded ? "player-expanded" : ""}`} aria-label="Music player"><div className="mini-player-track"><span className="track-art player-art">{nowPlaying.thumbnail ? <img src={nowPlaying.thumbnail} alt=""/> : <Music2 size={20}/>}</span><div><strong>{nowPlaying.title}</strong><span>{nowPlaying.artist}</span><small className="player-mood">If it doesn’t start, press play in the video.</small></div></div>{getYoutubeId(nowPlaying.url) ? <><iframe src={`https://www.youtube.com/embed/${getYoutubeId(nowPlaying.url)}?autoplay=1&controls=1&playsinline=1&rel=0`} title={`Play ${nowPlaying.title}`} referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture"/><a className="fallback-player-link" href={`https://music.youtube.com/watch?v=${getYoutubeId(nowPlaying.url)}`} target="_blank" rel="noreferrer">Open in YouTube Music <ExternalLink size={14}/></a></> : <a className="fallback-player-link" href={nowPlaying.url} target="_blank" rel="noreferrer">Open song search <ExternalLink size={14}/></a>}<div className="mini-player-controls"><button className="player-expand" onClick={() => setPlayerExpanded((expanded) => !expanded)} aria-label={playerExpanded ? "Collapse player" : "Expand player"} title={playerExpanded ? "Collapse player" : "Expand player"}><ChevronDown size={16}/></button><button onClick={() => moveQueue(-1)} aria-label="Previous song" disabled={playbackQueue.length < 2}>‹</button><span>{queueIndex + 1} / {playbackQueue.length}</span><button onClick={() => moveQueue(1)} aria-label="Next song" disabled={playbackQueue.length < 2}>›</button><button onClick={() => setNowPlaying(null)} aria-label="Close player"><X size={17}/></button></div></section>}
    {accountOpen && <AccountDialog onClose={() => { setAccountOpen(false); setAuthInitialMode("login"); setAuthResetToken(""); }} onAuthenticated={acceptAccount} initialMode={authInitialMode} resetToken={authResetToken}/>}
  </div>
  {entryLoading && <EntryScreen />}
  </>;
}

function getYoutubeId(url) { try { const parsed = new URL(url); return parsed.hostname.includes("youtu.be") ? parsed.pathname.slice(1) : parsed.searchParams.get("v") || parsed.pathname.match(/\/embed\/([^/]+)/)?.[1] || null; } catch { return null; } }
function feedbackToMap(items) {
  if (!Array.isArray(items)) return {};
  return Object.fromEntries(items.filter((item) => item && typeof item === "object" && item.track?.url && ["up", "down"].includes(item.vote)).map((item) => [item.track.url, item]));
}
