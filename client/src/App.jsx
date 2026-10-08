import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Bookmark, Camera, ChevronDown, Disc3, ExternalLink, Heart, Headphones, History as HistoryIcon, LoaderCircle, Music2, Radio, Sparkles, Trash2, Upload, Waves, X } from "lucide-react";
import TrackCard from "./components/TrackCard.jsx";
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

export default function App() {
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
  const [history, setHistory] = useState(() => {
    const stored = readStored("moodwave_history", []);
    return Array.isArray(stored) ? stored.slice(0, 20) : [];
  });
  const [feedback, setFeedback] = useState(() => {
    const stored = readStored("moodwave_feedback", {});
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  });
  const [nowPlaying, setNowPlaying] = useState(null);
  const [manualMood, setManualMood] = useState("");
  const playerCloseRef = useRef(null);
  const previousFocusRef = useRef(null);

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
    api("/api/favorites", {}, 6000)
      .then((tracks) => { if (active) { setFavorites(tracks); setFavoritesStatus("ready"); } })
      .catch((err) => { if (active) { setFavoritesStatus("unavailable"); setFavoritesError(err.message); } });
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
  useEffect(() => { writeStored("moodwave_history", history); }, [history]);
  useEffect(() => { writeStored("moodwave_feedback", feedback); }, [feedback]);

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
    setFeedback((current) => ({ ...current, [track.url]: { vote, at: new Date().toISOString(), track: { title: track.title, artist: track.artist, videoId } } }));
  }

  function clearHistory() { setHistory([]); }

  async function saveTrack(track) {
    if (!track.url) return;
    try {
      const saved = await api("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(track) });
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

  const visibleTracks = activeTab === "mix" ? result?.tracks || [] : favorites;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#top" aria-label="Moodwave home"><span className="brand-mark"><Waves size={21}/></span><span>moodwave<span className="brand-dot">.</span></span></a>
      <div className="side-label">YOUR SPACE</div>
      <button className={`side-link ${activeTab === "mix" ? "selected" : ""}`} onClick={() => setActiveTab("mix")}><AudioLines size={18}/> Discover <span className="side-active"/></button>
      <button className={`side-link ${activeTab === "saved" ? "selected" : ""}`} onClick={() => setActiveTab("saved")}><Bookmark size={18}/> Saved tracks {favorites.length > 0 && <span className="count-pill">{favorites.length}</span>}</button>
      <button className="side-link history-link" onClick={() => { setActiveTab("mix"); setTimeout(() => document.getElementById("listening-history")?.scrollIntoView({ behavior: "smooth" }), 0); }}><HistoryIcon size={18}/> Listening history</button>
      <div className="sidebar-note"><div className="note-icon"><Sparkles size={16}/></div><strong>Music meets mood.</strong><p>A small check-in can change the whole soundtrack.</p></div>
      <div className="sidebar-bottom"><span className={`live-dot ${serviceHealth.mongo ? "" : "status-muted"}`}/> {serviceHealth.mongo ? "Library connected" : serviceHealth.mongo === null ? "Checking library" : "Library offline"}<span className="version">v1.0</span></div>
    </aside>

    <main id="top" className="main-content">
      <header className="topbar"><div className="breadcrumb"><span>YOUR LISTENING SPACE</span><span className="crumb-divider">/</span><b>{activeTab === "mix" ? "Discover" : "Saved tracks"}</b></div><div className="top-right"><span className={`status-dot ${serviceHealth.python === false || serviceHealth.model === false ? "service-offline" : ""}`} aria-hidden="true"/><span aria-live="polite">{serviceHealth.python === null ? "Checking music service" : !serviceHealth.python ? "Music service offline" : !serviceHealth.model ? "Photo detection unavailable" : "Mood and music online"}</span><span className="avatar"><Headphones size={16}/></span></div></header>

      <section className="welcome-row"><div><div className="overline"><span className="overline-line"/> A SOUNDTRACK FOR RIGHT NOW</div><h1>How are you <span>feeling?</span></h1><p className="intro">Check in with yourself. We’ll find the songs that meet you there.</p></div><div className="hero-disc"><div className="disc-rings"><span/><span/><span/><i><Music2 size={22}/></i></div><div className="disc-spark spark-one">✦</div><div className="disc-spark spark-two">✧</div></div></section>

      {activeTab === "mix" ? <><div className="workspace-grid">
        <section className="checkin-card panel">
          <div className="card-heading"><div><span className="step-tag">01 / MOOD CHECK-IN</span><h2>Read the room</h2><p>Share a quick photo for an emotion estimate.</p></div><div className="heading-icon"><Camera size={19}/></div></div>
          <form onSubmit={detectMood}>
            {cameraOpen ? <div className="camera-live"><video ref={videoRef} autoPlay muted playsInline/><div className="camera-controls"><span><span className="camera-live-dot"/> CAMERA ON</span><button type="button" onClick={capturePhoto}><Camera size={15}/> Capture photo</button><button type="button" className="camera-cancel" onClick={closeCamera}>Cancel</button></div></div> : <>
              <label className={`dropzone ${preview ? "has-preview" : ""}`}>
                {preview ? <><img src={preview} alt="Your selected portrait"/><span className="photo-change"><Camera size={14}/> Change photo</span></> : <><span className="upload-icon"><Upload size={21}/></span><strong>Choose a photo, or open the camera</strong><span>JPG, PNG or WebP · up to 10 MB</span><em>Browse files</em></>}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { choosePhoto(event.target.files?.[0]); event.target.value = ""; }}/>
              </label>
              <div className="camera-launch-row"><span>For the full mood check-in</span><button type="button" onClick={openCamera}><Camera size={15}/> Open camera</button></div>
            </>}
            <canvas ref={canvasRef} className="capture-canvas" aria-hidden="true"/>
            <div className="privacy-note"><span className="privacy-lock">privacy</span> This photo is analyzed for your mood and is not stored by the app.</div>
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
            <label className="field mood-override"><span>USE THIS MOOD FOR MUSIC</span><div className="select-wrap"><Waves size={16}/><select value={mood} onChange={(event) => { setSelectedMood(event.target.value); setResult(null); }}>{emotions.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select><ChevronDown size={15}/></div></label>
            <div className="language-preferences">
              <div className="preference-heading"><span className="step-tag">03 / PERSONALISE YOUR MIX</span><span>Choose how you want to hear it</span></div>
              <label className="field language-field"><span>SONG LANGUAGE</span><div className="select-wrap"><span className="language-glyph">文</span><select value={language} onChange={(event) => { setLanguage(event.target.value); setResult(null); }}>{languages.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15}/></div></label>
              <div className="field-row preference-row"><label className="field"><span>YOUR SOUND</span><div className="select-wrap"><Disc3 size={16}/><select value={genre} onChange={(event) => { setGenre(event.target.value); setResult(null); }}>{genres.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15}/></div></label><label className="field"><span>THE FEELING</span><div className="select-wrap"><Radio size={16}/><select value={goal} onChange={(event) => { setGoal(event.target.value); setResult(null); }}>{goals.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15}/></div></label></div>
              <button className="find-songs-button" type="button" onClick={makeMix} disabled={busy}>{busy ? <><LoaderCircle className="spin" size={16}/> Finding songs...</> : <><Sparkles size={15}/> {Object.values(feedback).length ? "Refresh with my feedback" : `Find ${language === "No preference" ? "songs" : `${language} songs`}`} <span>→</span></>}</button>
            </div>
            {result && (result.tracks.length > 0 ? <>
              <div className="track-list recommendation-grid">{visibleTracks.map((track, index) => <TrackCard key={track.url || `${track.title}-${index}`} track={track} index={index} card saved={savedUrlSet.has(track.url)} onSave={saveTrack} feedbackValue={feedback[track.url]?.vote} onFeedback={rateTrack} onPlay={setNowPlaying}/>)}</div>
              <div className="mix-foot"><span><span className="tiny-live"/> {result.personalized ? "Ranked using your recent likes and dislikes" : result.source === "youtube_music" ? `Live ${language === "No preference" ? "music" : `${language} music`} results` : "Showing built-in suggestions"}</span><span>{result.tracks.length} tracks</span></div>
              <section className="taste-profile"><div><span className="step-tag">YOUR FEEDBACK PROFILE</span><strong>{likedCount + dislikedCount ? "Your next mix is learning your taste" : "Teach your next mix what you like"}</strong><p>{likedCount} liked · {dislikedCount} skipped <span>Feedback is kept on this device.</span></p></div>{likedCount + dislikedCount > 0 && <button type="button" onClick={() => setFeedback({})}>Clear feedback</button>}</section>
            </> : <div className="no-tracks"><Music2 size={18}/><span>{language === "No preference" ? "No matches came back this time. Try another language or style." : `No ${language} tracks came back this time. Try another language or style.`}</span></div>)}
          </> : <div className="empty-mix"><div className="empty-art"><div className="empty-vinyl"><span/></div><span className="empty-note note-a">♫</span><span className="empty-note note-b">♫</span></div><strong>Your next favorite is out there.</strong><p>Take a mood check-in, or choose how you feel to get a mix without sharing a photo.</p><div className="manual-mood-start"><label className="field"><span>CHOOSE YOUR MOOD</span><div className="select-wrap"><Waves size={16}/><select value={manualMood} onChange={(event) => setManualMood(event.target.value)}><option value="" disabled>Choose a mood</option>{emotions.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select><ChevronDown size={15}/></div></label><button className="find-songs-button" type="button" disabled={!manualMood} onClick={() => { setSelectedMood(manualMood); setMoodResult({ emotion: manualMood, manual: true }); }}><Sparkles size={15}/> Continue with this mood <span>→</span></button></div><div className="empty-tags"><span><Sparkles size={13}/> Personalised</span><span><ExternalLink size={13}/> Ready to play</span></div></div>}
        </section>
      </div>
      <section className="history-panel panel" id="listening-history">
        <div className="history-heading"><div><span className="step-tag">KEPT ON THIS DEVICE</span><h2>Listening history</h2></div>{history.length > 0 && <button className="clear-history" onClick={clearHistory}><Trash2 size={14}/> Clear history</button>}</div>
        {history.length ? <div className="history-list">{history.map((entry) => <article className="history-entry" key={entry.id}><div className="history-entry-head"><strong>{entry.emotion}</strong><span>{entry.language} · {entry.genre}</span><time>{new Date(entry.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div><div className="history-tracks">{entry.tracks.slice(0, 4).map((track) => track.url ? <a key={track.url} href={track.url} target="_blank" rel="noreferrer">{track.title} <span>· {track.artist}</span></a> : <span key={track.title}>{track.title} · {track.artist}</span>)}</div></article>)}</div> : <p className="history-empty">Your recent mood mixes will appear here. History stays in this browser.</p>}
      </section>
      </> : <section className="saved-page panel"><div className="card-heading"><div><span className="step-tag">YOUR COLLECTION</span><h2>Saved tracks</h2><p>Your little shelf of songs to come back to.</p></div><div className="heading-icon"><Heart size={19}/></div></div>{favoritesStatus === "loading" ? <div className="saved-empty" role="status"><LoaderCircle className="spin" size={22}/><strong>Loading your library…</strong></div> : favorites.length ? <div className="track-list">{favorites.map((track, index) => <div className="saved-row" key={track._id}><TrackCard track={track} index={index} onPlay={setNowPlaying}/><button className="remove-button" onClick={() => removeTrack(track)} aria-label={`Remove ${track.title}`}><X size={16}/></button></div>)}</div> : favoritesStatus === "unavailable" && serviceHealth.mongo ? <div className="saved-empty"><strong>Couldn’t load your library</strong><span>{favoritesError}</span><button className="clear-history" onClick={refreshFavorites}>Try again</button></div> : <div className="saved-empty"><Bookmark size={25}/><strong>No saved tracks yet</strong><span>Your saved songs will live here.</span>{serviceHealth.mongo === false && <small>Connect MongoDB to enable a persistent saved library.</small>}</div>}</section>}

      <footer className="page-footer"><span>MOODWAVE <span className="footer-dot">●</span> MUSIC FOR YOUR MOMENT</span><span>Take what you need. Leave what you don’t.</span></footer>
    </main>
    {nowPlaying && <div className="player-backdrop" role="presentation" onClick={() => setNowPlaying(null)}><section className="player-modal" role="dialog" aria-modal="true" aria-label={`Now playing ${nowPlaying.title}`} onClick={(event) => event.stopPropagation()}><div className="player-heading"><div><span className="step-tag">{nowPlaying.isFallback ? "FALLBACK PICK" : "NOW PLAYING"}</span><h2>{nowPlaying.title}</h2><p>{nowPlaying.artist}</p></div><button ref={playerCloseRef} className="player-close" onClick={() => setNowPlaying(null)} aria-label="Close player"><X size={18}/></button></div><div className="player-frame">{getYoutubeId(nowPlaying.url) ? <iframe src={`https://www.youtube-nocookie.com/embed/${getYoutubeId(nowPlaying.url)}?autoplay=1&rel=0`} title={`Play ${nowPlaying.title}`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/> : <div className="player-unavailable"><Music2 size={24}/><span>{nowPlaying.isFallback ? "Live search is unavailable, but you can find and play this song on YouTube Music." : "This recommendation can’t be played in the built-in player."}</span><a href={nowPlaying.url} target="_blank" rel="noreferrer">{nowPlaying.isFallback ? "Search and play on YouTube Music" : "Open song"} <ExternalLink size={14}/></a></div>}</div></section></div>}
  </div>;
}

function getYoutubeId(url) { try { const parsed = new URL(url); return parsed.hostname.includes("youtu.be") ? parsed.pathname.slice(1) : parsed.searchParams.get("v") || parsed.pathname.match(/\/embed\/([^/]+)/)?.[1] || null; } catch { return null; } }
