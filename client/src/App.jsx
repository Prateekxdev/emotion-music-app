import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Bookmark, Camera, Check, ChevronDown, Disc3, ExternalLink, Heart, Headphones, History as HistoryIcon, LoaderCircle, Music2, Radio, RefreshCw, Sparkles, ThumbsDown, ThumbsUp, Trash2, Upload, Waves, X } from "lucide-react";

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

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.detail || data?.error || "Something went wrong. Please try again.");
  return data;
}

function readStored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

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
  const [mongoOnline, setMongoOnline] = useState(false);
  const [activeTab, setActiveTab] = useState("mix");
  const [savedIds, setSavedIds] = useState(new Set());
  const [history, setHistory] = useState(() => readStored("moodwave_history", []));
  const [feedback, setFeedback] = useState(() => readStored("moodwave_feedback", {}));

  useEffect(() => {
    api("/api/health").then((health) => setMongoOnline(health.mongo)).catch(() => {});
    api("/api/favorites").then(setFavorites).catch(() => {});
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
  useEffect(() => { localStorage.setItem("moodwave_history", JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem("moodwave_feedback", JSON.stringify(feedback)); }, [feedback]);

  const mood = (selectedMood || moodResult?.emotion || result?.emotion)?.toLowerCase();
  const copy = moodCopy[mood] || ["A soundtrack for right now.", "YOUR PERSONAL MIX"];
  const savedUrlSet = useMemo(() => new Set(favorites.map((song) => song.url)), [favorites]);

  function choosePhoto(nextFile) {
    if (!nextFile) return;
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
      const detected = await api("/api/detect", { method: "POST", body });
      setMoodResult(detected);
      setSelectedMood(detected.emotion);
      setResult(null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function makeMix() {
    if (!moodResult) return;
    setBusy(true); setError("");
    try {
      const mix = await api("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emotion: mood,
          genre,
          goal,
          language,
          likedTracks: Object.values(feedback).filter((item) => item.vote === "up").map((item) => item.track).slice(0, 5),
          dislikedIds: Object.values(feedback).filter((item) => item.vote === "down").map((item) => item.track.videoId).filter(Boolean),
        }),
      });
      setResult(mix);
      const entry = { id: `${Date.now()}`, at: new Date().toISOString(), emotion: mood, language, genre, tracks: (mix.tracks || []).map(({ title, artist, url }) => ({ title, artist, url })) };
      setHistory((items) => [entry, ...items].slice(0, 20));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function rateTrack(track, vote) {
    if (!track.url) return;
    const videoId = new URL(track.url).searchParams.get("v");
    setFeedback((current) => ({ ...current, [track.url]: { vote, track: { title: track.title, artist: track.artist, videoId } } }));
  }

  function clearHistory() { setHistory([]); }

  async function saveTrack(track) {
    if (!track.url) return;
    try {
      const saved = await api("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(track) });
      setFavorites((current) => [saved, ...current.filter((item) => item.url !== saved.url)]);
      setSavedIds((ids) => new Set(ids).add(track.url));
    } catch (err) { setError(err.message); }
  }

  async function removeTrack(song) {
    try {
      await api(`/api/favorites/${song._id}`, { method: "DELETE" });
      setFavorites((items) => items.filter((item) => item._id !== song._id));
      setSavedIds((ids) => { const next = new Set(ids); next.delete(song.url); return next; });
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
      <div className="sidebar-bottom"><span className="live-dot"/> {mongoOnline ? "Library connected" : "Personal mood player"}<span className="version">v1.0</span></div>
    </aside>

    <main id="top" className="main-content">
      <header className="topbar"><div className="breadcrumb"><span>YOUR LISTENING SPACE</span><span className="crumb-divider">/</span><b>{activeTab === "mix" ? "Discover" : "Saved tracks"}</b></div><div className="top-right"><span className="status-dot"/> Mood-aware music <span className="avatar"><Headphones size={16}/></span></div></header>

      <section className="welcome-row"><div><div className="overline"><span className="overline-line"/> A SOUNDTRACK FOR RIGHT NOW</div><h1>How are you <span>feeling?</span></h1><p className="intro">Check in with yourself. We’ll find the songs that meet you there.</p></div><div className="hero-disc"><div className="disc-rings"><span/><span/><span/><i><Music2 size={22}/></i></div><div className="disc-spark spark-one">✦</div><div className="disc-spark spark-two">✧</div></div></section>

      {activeTab === "mix" ? <><div className="workspace-grid">
        <section className="checkin-card panel">
          <div className="card-heading"><div><span className="step-tag">01 / MOOD CHECK-IN</span><h2>Read the room</h2><p>Share a quick photo for an emotion estimate.</p></div><div className="heading-icon"><Camera size={19}/></div></div>
          <form onSubmit={detectMood}>
            {cameraOpen ? <div className="camera-live"><video ref={videoRef} autoPlay muted playsInline/><div className="camera-controls"><span><span className="camera-live-dot"/> CAMERA ON</span><button type="button" onClick={capturePhoto}><Camera size={15}/> Capture photo</button><button type="button" className="camera-cancel" onClick={closeCamera}>Cancel</button></div></div> : <>
              <label className={`dropzone ${preview ? "has-preview" : ""}`}>
                {preview ? <><img src={preview} alt="Your selected portrait"/><span className="photo-change"><Camera size={14}/> Change photo</span></> : <><span className="upload-icon"><Upload size={21}/></span><strong>Choose a photo, or open the camera</strong><span>JPG, PNG or WebP · up to 10 MB</span><em>Browse files</em></>}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])}/>
              </label>
              <div className="camera-launch-row"><span>For the full mood check-in</span><button type="button" onClick={openCamera}><Camera size={15}/> Open camera</button></div>
            </>}
            <canvas ref={canvasRef} className="capture-canvas" aria-hidden="true"/>
            <div className="privacy-note"><span className="privacy-lock">privacy</span> This photo is analyzed for your mood and is not stored by the app.</div>
            <button className="primary-button" disabled={busy || !file}>{busy ? <><LoaderCircle className="spin" size={18}/> Reading your mood...</> : <><Sparkles size={17}/> {moodResult ? "Detect my mood again" : "Detect my mood"} <span>→</span></>}</button>
          </form>
          {error && <div className="error-banner"><span>!</span>{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={15}/></button></div>}
          <div className="soft-disclaimer">An AI estimate, not a diagnosis. Your feelings are yours to name.</div>
        </section>

        <section className="mix-panel">
          <div className="mix-header"><div><span className="step-tag">02 / YOUR SOUNDTRACK</span><h2>{result ? "Made for this moment" : moodResult ? "Mood detected" : "Your mix is waiting"}</h2></div>{result && <div className="live-pill"><span/> {result.source === "youtube_music" ? "LIVE PICKS" : result.source === "unavailable" ? "NO RESULTS" : "MOOD PICKS"}</div>}</div>
          {moodResult ? <>
            <div className="mood-summary"><div className="mood-orb"><Waves size={22}/></div><div><span className="mood-label">DETECTED MOOD</span><strong>{mood}</strong><small>{copy[0]}</small></div><div className="confidence"><span>MODEL CONFIDENCE</span><b>{Math.round(moodResult.confidence * 100)}%</b></div></div>
            {moodResult.confidence < 0.5 && <div className="confidence-hint">The model is unsure. Choose the mood that feels right to you.</div>}
            <label className="field mood-override"><span>USE THIS MOOD FOR MUSIC</span><div className="select-wrap"><Waves size={16}/><select value={mood} onChange={(event) => { setSelectedMood(event.target.value); setResult(null); }}>{emotions.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select><ChevronDown size={15}/></div></label>
            <div className="language-preferences">
              <div className="preference-heading"><span className="step-tag">03 / PERSONALISE YOUR MIX</span><span>Choose how you want to hear it</span></div>
              <label className="field language-field"><span>SONG LANGUAGE</span><div className="select-wrap"><span className="language-glyph">文</span><select value={language} onChange={(event) => { setLanguage(event.target.value); setResult(null); }}>{languages.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15}/></div></label>
              <div className="field-row preference-row"><label className="field"><span>YOUR SOUND</span><div className="select-wrap"><Disc3 size={16}/><select value={genre} onChange={(event) => { setGenre(event.target.value); setResult(null); }}>{genres.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15}/></div></label><label className="field"><span>THE FEELING</span><div className="select-wrap"><Radio size={16}/><select value={goal} onChange={(event) => { setGoal(event.target.value); setResult(null); }}>{goals.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15}/></div></label></div>
              <button className="find-songs-button" type="button" onClick={makeMix} disabled={busy}>{busy ? <><LoaderCircle className="spin" size={16}/> Finding songs...</> : <><Sparkles size={15}/> {Object.values(feedback).length ? "Refresh with my feedback" : `Find ${language === "No preference" ? "songs" : `${language} songs`}`} <span>→</span></>}</button>
            </div>
            {result && (result.tracks.length > 0 ? <>
              <div className="track-list">{visibleTracks.map((track, index) => <TrackRow key={track.url || `${track.title}-${index}`} track={track} index={index} saved={savedUrlSet.has(track.url) || savedIds.has(track.url)} onSave={saveTrack} feedbackValue={feedback[track.url]?.vote} onFeedback={rateTrack}/>)}</div>
              <div className="mix-foot"><span><span className="tiny-live"/> {result.source === "youtube_music" ? `Live ${language === "No preference" ? "music" : `${language} music`} results` : "Showing built-in suggestions"}</span><span>{result.tracks.length} tracks</span></div>
            </> : <div className="no-tracks"><Music2 size={18}/><span>{language === "No preference" ? "No matches came back this time. Try another language or style." : `No ${language} tracks came back this time. Try another language or style.`}</span></div>)}
          </> : <div className="empty-mix"><div className="empty-art"><div className="empty-vinyl"><span/></div><span className="empty-note note-a">♫</span><span className="empty-note note-b">♫</span></div><strong>Your next favorite is out there.</strong><p>Take a mood check-in and we’ll put together a fresh mix for you.</p><div className="empty-tags"><span><Sparkles size={13}/> Personalised</span><span><ExternalLink size={13}/> Ready to play</span></div></div>}
        </section>
      </div>
      <section className="history-panel panel" id="listening-history">
        <div className="history-heading"><div><span className="step-tag">KEPT ON THIS DEVICE</span><h2>Listening history</h2></div>{history.length > 0 && <button className="clear-history" onClick={clearHistory}><Trash2 size={14}/> Clear history</button>}</div>
        {history.length ? <div className="history-list">{history.map((entry) => <article className="history-entry" key={entry.id}><div className="history-entry-head"><strong>{entry.emotion}</strong><span>{entry.language} · {entry.genre}</span><time>{new Date(entry.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div><div className="history-tracks">{entry.tracks.slice(0, 4).map((track) => track.url ? <a key={track.url} href={track.url} target="_blank" rel="noreferrer">{track.title} <span>· {track.artist}</span></a> : <span key={track.title}>{track.title} · {track.artist}</span>)}</div></article>)}</div> : <p className="history-empty">Your recent mood mixes will appear here. History stays in this browser.</p>}
      </section>
      </> : <section className="saved-page panel"><div className="card-heading"><div><span className="step-tag">YOUR COLLECTION</span><h2>Saved tracks</h2><p>Your little shelf of songs to come back to.</p></div><div className="heading-icon"><Heart size={19}/></div></div>{favorites.length ? <div className="track-list">{favorites.map((track, index) => <div className="saved-row" key={track._id}><TrackRow track={track} index={index} saved onSave={() => removeTrack(track)}/><button className="remove-button" onClick={() => removeTrack(track)} aria-label={`Remove ${track.title}`}><X size={16}/></button></div>)}</div> : <div className="saved-empty"><Bookmark size={25}/><strong>No saved tracks yet</strong><span>Tap the heart on a live recommendation to keep it here.</span>{!mongoOnline && <small>Start MongoDB and set MONGODB_URI to enable saving.</small>}</div>}</section>}

      <footer className="page-footer"><span>MOODWAVE <span className="footer-dot">●</span> MUSIC FOR YOUR MOMENT</span><span>Take what you need. Leave what you don’t.</span></footer>
    </main>
  </div>;
}

function TrackRow({ track, index, saved, onSave, feedbackValue, onFeedback }) {
  return <article className="track-row"><div className="track-art">{track.thumbnail ? <img src={track.thumbnail} alt="" loading="lazy"/> : <div className={`fallback-art art-${index % 4}`}><Music2 size={20}/></div>}<span className="track-index">{String(index + 1).padStart(2, "0")}</span></div><div className="track-info"><strong>{track.title}</strong><span>{track.artist}</span></div><div className="track-actions">{track.url && <>
    {onFeedback && <><button className={`feedback-button ${feedbackValue === "up" ? "active" : ""}`} onClick={() => onFeedback(track, "up")} title="More like this" aria-label="Like this track"><ThumbsUp size={14}/></button><button className={`feedback-button ${feedbackValue === "down" ? "active" : ""}`} onClick={() => onFeedback(track, "down")} title="Less like this" aria-label="Dislike this track"><ThumbsDown size={14}/></button></>}
    <button className={`save-button ${saved ? "is-saved" : ""}`} onClick={onSave} title={saved ? "Saved to your collection" : "Save track"} aria-label={saved ? "Saved" : "Save track"}>{saved ? <Check size={16}/> : <Heart size={16}/>}</button><a className="play-button" href={track.url} target="_blank" rel="noreferrer" aria-label={`Listen to ${track.title}`}><ExternalLink size={15}/></a>
  </>}</div></article>;
}
