import { useEffect, useMemo, useState } from "react";
import { AudioLines, Bookmark, Camera, Check, ChevronDown, Disc3, ExternalLink, Heart, Headphones, LoaderCircle, Music2, Radio, Sparkles, Upload, Waves, X } from "lucide-react";

const genres = ["Let the mood decide", "Pop", "Rock", "Acoustic", "Electronic", "Lo-fi", "Jazz", "Classical", "Hip-hop", "Indie"];
const goals = ["Match my mood", "Lift my mood", "Help me relax"];
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

export default function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [genre, setGenre] = useState(genres[0]);
  const [goal, setGoal] = useState(goals[0]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [favorites, setFavorites] = useState([]);
  const [mongoOnline, setMongoOnline] = useState(false);
  const [activeTab, setActiveTab] = useState("mix");
  const [savedIds, setSavedIds] = useState(new Set());

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

  const mood = result?.emotion?.toLowerCase();
  const copy = moodCopy[mood] || ["A soundtrack for right now.", "YOUR PERSONAL MIX"];
  const savedUrlSet = useMemo(() => new Set(favorites.map((song) => song.url)), [favorites]);

  function choosePhoto(nextFile) {
    if (!nextFile) return;
    setFile(nextFile); setResult(null); setError(""); setActiveTab("mix");
  }

  async function makeMix(event) {
    event.preventDefault();
    if (!file) { setError("Add a photo first so we can read the mood."); return; }
    setBusy(true); setError("");
    try {
      const body = new FormData();
      body.append("photo", file);
      body.append("genre", genre);
      body.append("goal", goal);
      setResult(await api("/api/recommendations", { method: "POST", body }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

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
      <div className="sidebar-note"><div className="note-icon"><Sparkles size={16}/></div><strong>Music meets mood.</strong><p>A small check-in can change the whole soundtrack.</p></div>
      <div className="sidebar-bottom"><span className="live-dot"/> {mongoOnline ? "Library connected" : "Personal mood player"}<span className="version">v1.0</span></div>
    </aside>

    <main id="top" className="main-content">
      <header className="topbar"><div className="breadcrumb"><span>YOUR LISTENING SPACE</span><span className="crumb-divider">/</span><b>{activeTab === "mix" ? "Discover" : "Saved tracks"}</b></div><div className="top-right"><span className="status-dot"/> Mood-aware music <span className="avatar"><Headphones size={16}/></span></div></header>

      <section className="welcome-row"><div><div className="overline"><span className="overline-line"/> A SOUNDTRACK FOR RIGHT NOW</div><h1>How are you <span>feeling?</span></h1><p className="intro">Check in with yourself. We’ll find the songs that meet you there.</p></div><div className="hero-disc"><div className="disc-rings"><span/><span/><span/><i><Music2 size={22}/></i></div><div className="disc-spark spark-one">✦</div><div className="disc-spark spark-two">✧</div></div></section>

      {activeTab === "mix" ? <div className="workspace-grid">
        <section className="checkin-card panel">
          <div className="card-heading"><div><span className="step-tag">01 / MOOD CHECK-IN</span><h2>Read the room</h2><p>Share a quick photo for an emotion estimate.</p></div><div className="heading-icon"><Camera size={19}/></div></div>
          <form onSubmit={makeMix}>
            <label className={`dropzone ${preview ? "has-preview" : ""}`}>
              {preview ? <><img src={preview} alt="Your selected portrait"/><span className="photo-change"><Camera size={14}/> Change photo</span></> : <><span className="upload-icon"><Upload size={21}/></span><strong>Drop in a photo, or browse</strong><span>JPG, PNG or WebP · up to 10 MB</span><em>Choose photo</em></>}
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={(event) => choosePhoto(event.target.files?.[0])}/>
            </label>
            <div className="privacy-note"><span className="privacy-lock">◈</span> Your photo is used for this mood check only.</div>
            <div className="field-row"><label className="field"><span>YOUR SOUND</span><div className="select-wrap"><Disc3 size={16}/><select value={genre} onChange={(event) => setGenre(event.target.value)}>{genres.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15}/></div></label><label className="field"><span>THE FEELING</span><div className="select-wrap"><Radio size={16}/><select value={goal} onChange={(event) => setGoal(event.target.value)}>{goals.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15}/></div></label></div>
            <button className="primary-button" disabled={busy || !file}>{busy ? <><LoaderCircle className="spin" size={18}/> Reading your mood...</> : <><Sparkles size={17}/> Find my soundtrack <span>→</span></>}</button>
          </form>
          {error && <div className="error-banner"><span>!</span>{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={15}/></button></div>}
          <div className="soft-disclaimer">An AI estimate, not a diagnosis. Your feelings are yours to name.</div>
        </section>

        <section className="mix-panel">
          <div className="mix-header"><div><span className="step-tag">02 / YOUR SOUNDTRACK</span><h2>{result ? "Made for this moment" : "Your mix is waiting"}</h2></div>{result && <div className="live-pill"><span/> {result.source === "youtube_music" ? "LIVE PICKS" : "MOOD PICKS"}</div>}</div>
          {result ? <>
            <div className="mood-summary"><div className="mood-orb"><Waves size={22}/></div><div><span className="mood-label">WE’RE FEELING</span><strong>{mood}</strong><small>{copy[0]}</small></div><div className="confidence"><span>MODEL CONFIDENCE</span><b>{Math.round(result.confidence * 100)}%</b></div></div>
            <div className="track-list">{visibleTracks.map((track, index) => <TrackRow key={track.url || `${track.title}-${index}`} track={track} index={index} saved={savedUrlSet.has(track.url) || savedIds.has(track.url)} onSave={saveTrack}/>)}</div>
            <div className="mix-foot"><span><span className="tiny-live"/> {result.source === "youtube_music" ? "Fresh results from YouTube Music" : "Showing built-in suggestions"}</span><span>{result.tracks.length} tracks</span></div>
          </> : <div className="empty-mix"><div className="empty-art"><div className="empty-vinyl"><span/></div><span className="empty-note note-a">♪</span><span className="empty-note note-b">♫</span></div><strong>Your next favorite is out there.</strong><p>Take a mood check-in and we’ll put together a fresh mix for you.</p><div className="empty-tags"><span><Sparkles size={13}/> Personalised</span><span><ExternalLink size={13}/> Ready to play</span></div></div>}
        </section>
      </div> : <section className="saved-page panel"><div className="card-heading"><div><span className="step-tag">YOUR COLLECTION</span><h2>Saved tracks</h2><p>Your little shelf of songs to come back to.</p></div><div className="heading-icon"><Heart size={19}/></div></div>{favorites.length ? <div className="track-list">{favorites.map((track, index) => <div className="saved-row" key={track._id}><TrackRow track={track} index={index} saved onSave={() => removeTrack(track)}/><button className="remove-button" onClick={() => removeTrack(track)} aria-label={`Remove ${track.title}`}><X size={16}/></button></div>)}</div> : <div className="saved-empty"><Bookmark size={25}/><strong>No saved tracks yet</strong><span>Tap the heart on a live recommendation to keep it here.</span>{!mongoOnline && <small>Start MongoDB and set MONGODB_URI to enable saving.</small>}</div>}</section>}

      <footer className="page-footer"><span>MOODWAVE <span className="footer-dot">●</span> MUSIC FOR YOUR MOMENT</span><span>Take what you need. Leave what you don’t.</span></footer>
    </main>
  </div>;
}

function TrackRow({ track, index, saved, onSave }) {
  return <article className="track-row"><div className="track-art">{track.thumbnail ? <img src={track.thumbnail} alt="" loading="lazy"/> : <div className={`fallback-art art-${index % 4}`}><Music2 size={20}/></div>}<span className="track-index">{String(index + 1).padStart(2, "0")}</span></div><div className="track-info"><strong>{track.title}</strong><span>{track.artist}</span></div><div className="track-actions">{track.url && <><button className={`save-button ${saved ? "is-saved" : ""}`} onClick={onSave} title={saved ? "Saved to your collection" : "Save track"} aria-label={saved ? "Saved" : "Save track"}>{saved ? <Check size={16}/> : <Heart size={16}/>}</button><a className="play-button" href={track.url} target="_blank" rel="noreferrer" aria-label={`Listen to ${track.title}`}><ExternalLink size={15}/></a></>}</div></article>;
}
