import "dotenv/config";
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import path from "node:path";
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 5000);
const pythonApi = process.env.PYTHON_API_URL || "http://127.0.0.1:8000";
const here = path.dirname(fileURLToPath(import.meta.url));
const scrypt = promisify(scryptCallback);
const tokenSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : "moodwave-local-development-secret-change-me");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const allowedMoods = new Set(["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]);
const allowedLanguages = new Set(["No preference", "English", "Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "Punjabi", "Bengali", "Marathi", "Gujarati", "Urdu", "Korean", "Japanese", "Spanish", "French", "Arabic", "Instrumental / no vocals"]);

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  next();
});
app.use(express.json({ limit: "1mb" }));

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true },
  feedback: { type: [mongoose.Schema.Types.Mixed], default: [] },
  history: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });
const User = mongoose.model("User", userSchema);

const songSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, maxlength: 240 },
  artist: { type: String, required: true, maxlength: 240 },
  url: { type: String, required: true, maxlength: 512 },
  thumbnail: { type: String, default: "", maxlength: 2048 },
}, { timestamps: true });
const SavedSong = mongoose.model("SavedSong", songSchema);

const playlistSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  tracks: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });
const Playlist = mongoose.model("Playlist", playlistSchema);

function cookieValue(req, name) {
  const part = (req.headers.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}
function signSession(userId, expiresAt) {
  const payload = Buffer.from(JSON.stringify({ sub: String(userId), exp: expiresAt })).toString("base64url");
  const signature = createHmac("sha256", tokenSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
function currentUser(req) {
  if (!tokenSecret) return null;
  try {
    const [payload, signature] = cookieValue(req, "moodwave_session").split(".");
    if (!payload || !signature) return null;
    const expected = createHmac("sha256", tokenSecret).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!decoded.sub || decoded.exp < Date.now()) return null;
    return decoded.sub;
  } catch { return null; }
}
function requireUser(req, res, next) {
  const userId = currentUser(req);
  if (!userId) return res.status(401).json({ error: "Sign in to use your personal library." });
  req.userId = userId;
  next();
}
function mongoReady(res) {
  if (mongoose.connection.readyState === 1) return true;
  res.status(503).json({ error: "Persistent account features need a MongoDB connection." });
  return false;
}
function setSession(res, user) {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  res.cookie("moodwave_session", signSession(user._id, expiresAt), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000, path: "/",
  });
}
function publicUser(user) { return { id: String(user._id), email: user.email }; }

app.post("/api/auth/register", async (req, res) => {
  if (!mongoReady(res)) return;
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 10 || password.length > 128) {
    return res.status(400).json({ error: "Enter a valid email and a password of 10–128 characters." });
  }
  if (!tokenSecret) return res.status(503).json({ error: "Set SESSION_SECRET before enabling production sign-in." });
  try {
    const salt = randomBytes(16).toString("hex");
    const derived = await scrypt(password, salt, 64);
    const user = await User.create({ email, passwordHash: `${salt}:${derived.toString("hex")}` });
    setSession(res, user);
    res.status(201).json({ user: publicUser(user), feedback: [], history: [] });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "An account with that email already exists." });
    res.status(500).json({ error: "Could not create your account." });
  }
});
app.post("/api/auth/login", async (req, res) => {
  if (!mongoReady(res)) return;
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!tokenSecret) return res.status(503).json({ error: "Set SESSION_SECRET before enabling production sign-in." });
  try {
    const user = await User.findOne({ email });
    const [salt, storedHash] = (user?.passwordHash || ":").split(":");
    const derived = await scrypt(password, salt || "invalid", 64);
    const stored = Buffer.from(storedHash || "", "hex");
    if (!user || stored.length !== derived.length || !timingSafeEqual(stored, derived)) return res.status(401).json({ error: "Email or password is incorrect." });
    setSession(res, user);
    res.json({ user: publicUser(user), feedback: user.feedback, history: user.history });
  } catch { res.status(500).json({ error: "Could not sign in right now." }); }
});
app.get("/api/auth/me", requireUser, async (req, res) => {
  if (!mongoReady(res)) return;
  const user = await User.findById(req.userId).select("email feedback history").lean();
  if (!user) return res.status(401).json({ error: "Your account is no longer available." });
  res.json({ user: publicUser({ ...user, _id: req.userId }), feedback: user.feedback, history: user.history });
});
app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("moodwave_session", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  res.status(204).end();
});

app.get("/api/profile", requireUser, async (req, res) => {
  if (!mongoReady(res)) return;
  const user = await User.findById(req.userId).select("feedback history").lean();
  if (!user) return res.status(404).json({ error: "Account not found." });
  res.json({ feedback: user.feedback, history: user.history });
});
app.put("/api/profile", requireUser, async (req, res) => {
  if (!mongoReady(res)) return;
  const { feedback, history } = req.body || {};
  if (!Array.isArray(feedback) || !Array.isArray(history) || feedback.length > 500 || history.length > 100) return res.status(400).json({ error: "Feedback or listening history is invalid." });
  try {
    await User.findByIdAndUpdate(req.userId, { $set: { feedback, history } }, { runValidators: true });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not save your personal data." }); }
});

app.get("/api/playlists", requireUser, async (req, res) => {
  if (!mongoReady(res)) return;
  try { res.json(await Playlist.find({ owner: req.userId }).sort({ updatedAt: -1 }).lean()); }
  catch { res.status(500).json({ error: "Could not load playlists." }); }
});
app.post("/api/playlists", requireUser, async (req, res) => {
  if (!mongoReady(res)) return;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 80) return res.status(400).json({ error: "Playlist names must be 1–80 characters." });
  try { res.status(201).json(await Playlist.create({ owner: req.userId, name, tracks: [] })); }
  catch { res.status(500).json({ error: "Could not create playlist." }); }
});
app.post("/api/playlists/:id/tracks", requireUser, async (req, res) => {
  if (!mongoReady(res)) return;
  const { track } = req.body || {};
  if (!track || typeof track.title !== "string" || typeof track.artist !== "string" || typeof track.url !== "string" || !track.url.startsWith("https://music.youtube.com/")) return res.status(400).json({ error: "Choose a valid track to add." });
  try {
    const playlist = await Playlist.findOne({ _id: req.params.id, owner: req.userId });
    if (!playlist) return res.status(404).json({ error: "Playlist not found." });
    if (playlist.tracks.length >= 500) return res.status(409).json({ error: "This playlist has reached its 500 track limit." });
    if (!playlist.tracks.some((item) => item.url === track.url)) playlist.tracks.push({ title: track.title.slice(0, 240), artist: track.artist.slice(0, 240), url: track.url.slice(0, 512), thumbnail: String(track.thumbnail || "").slice(0, 2048) });
    await playlist.save(); res.json(playlist);
  } catch { res.status(500).json({ error: "Could not update playlist." }); }
});
app.delete("/api/playlists/:id/tracks", requireUser, async (req, res) => {
  if (!mongoReady(res)) return;
  const url = req.body?.url;
  try {
    const playlist = await Playlist.findOneAndUpdate({ _id: req.params.id, owner: req.userId }, { $pull: { tracks: { url } } }, { new: true });
    if (!playlist) return res.status(404).json({ error: "Playlist not found." });
    res.json(playlist);
  } catch { res.status(500).json({ error: "Could not update playlist." }); }
});
app.delete("/api/playlists/:id", requireUser, async (req, res) => {
  if (!mongoReady(res)) return;
  try { const result = await Playlist.deleteOne({ _id: req.params.id, owner: req.userId }); result.deletedCount ? res.status(204).end() : res.status(404).json({ error: "Playlist not found." }); }
  catch { res.status(500).json({ error: "Could not delete playlist." }); }
});
app.delete("/api/account", requireUser, async (req, res) => {
  if (!mongoReady(res)) return;
  try {
    await Promise.all([SavedSong.deleteMany({ owner: req.userId }), Playlist.deleteMany({ owner: req.userId }), User.findByIdAndDelete(req.userId)]);
    res.clearCookie("moodwave_session", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
    res.status(204).end();
  } catch { res.status(500).json({ error: "Could not delete the account and its data." }); }
});

app.get("/api/health", async (_req, res) => {
  let python = false;
  let model = false;
  try {
    const response = await fetch(`${pythonApi}/health`, { signal: AbortSignal.timeout(10000) });
    python = response.ok;
    if (python) model = (await response.json()).model_available === true;
  } catch { /* the UI receives a useful status instead of an unhandled rejection */ }
  res.json({ status: python ? "ok" : "degraded", python, model, mongo: mongoose.connection.readyState === 1 });
});

app.post("/api/detect", upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose a photo first." });
  if (!["image/jpeg", "image/png", "image/webp"].includes(req.file.mimetype)) {
    return res.status(415).json({ error: "Upload a JPG, PNG, or WebP photo." });
  }
  const form = new FormData();
  form.append("photo", new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || "mood.jpg");
  try {
    const response = await fetch(`${pythonApi}/detect`, { method: "POST", body: form, signal: AbortSignal.timeout(60000) });
    const payload = await response.json();
    res.status(response.status).json(payload);
  } catch (error) {
    res.status(503).json({ error: "Could not reach the Python emotion service. Start it on port 8000 and retry." });
  }
});

app.post("/api/recommendations", async (req, res) => {
  const { emotion, genre, goal, language, likedTracks = [], dislikedTracks = [], dislikedIds = [] } = req.body || {};
  if (!allowedMoods.has(emotion) || typeof genre !== "string" || genre.length > 80 || typeof goal !== "string" || goal.length > 80 || !allowedLanguages.has(language)) {
    return res.status(400).json({ error: "Choose a valid mood and music preference." });
  }
  if (!Array.isArray(likedTracks) || !Array.isArray(dislikedTracks) || !Array.isArray(dislikedIds)) {
    return res.status(400).json({ error: "Recommendation feedback must be sent as lists." });
  }
  const form = new FormData();
  form.append("emotion", String(emotion || ""));
  form.append("genre", String(genre || "Let the mood decide"));
  form.append("goal", String(goal || "Match my mood"));
  form.append("language", String(language || "No preference"));
  form.append("liked_tracks", JSON.stringify(Array.isArray(likedTracks) ? likedTracks.slice(0, 5) : []));
  form.append("disliked_ids", JSON.stringify(Array.isArray(dislikedIds) ? dislikedIds.slice(0, 50) : []));
  form.append("disliked_tracks", JSON.stringify(Array.isArray(dislikedTracks) ? dislikedTracks.slice(0, 10) : []));
  try {
    const response = await fetch(`${pythonApi}/recommendations`, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
    const payload = await response.json();
    res.status(response.status).json(payload);
  } catch {
    res.status(503).json({ error: "Could not reach the Python music service. Check that it is running on port 8000." });
  }
});

app.get("/api/favorites", requireUser, async (req, res) => {
  if (!mongoReady(res)) return;
  try { res.json(await SavedSong.find({ owner: req.userId }).sort({ createdAt: -1 }).limit(100).lean()); }
  catch { res.status(500).json({ error: "Could not load saved tracks." }); }
});

app.post("/api/favorites", requireUser, async (req, res) => {
  if (!mongoReady(res)) return;
  const { title, artist, url, thumbnail = "" } = req.body || {};
  const validTrackUrl = (() => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname === "music.youtube.com" && parsed.pathname === "/watch" && /^[\w-]{11}$/.test(parsed.searchParams.get("v") || "");
    } catch { return false; }
  })();
  if (typeof title !== "string" || !title.trim() || title.length > 240 || typeof artist !== "string" || !artist.trim() || artist.length > 240 || !validTrackUrl) {
    return res.status(400).json({ error: "A valid YouTube Music track is required." });
  }
  try {
    const song = await SavedSong.findOneAndUpdate({ owner: req.userId, url }, { owner: req.userId, title, artist, url, thumbnail }, { upsert: true, new: true, runValidators: true });
    res.status(201).json(song);
  } catch { res.status(500).json({ error: "Could not save this track." }); }
});

app.delete("/api/favorites/:id", requireUser, async (req, res) => {
  if (!mongoReady(res)) return;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid saved track." });
  try { await SavedSong.findOneAndDelete({ _id: req.params.id, owner: req.userId }); res.status(204).end(); }
  catch { res.status(500).json({ error: "Could not remove this track." }); }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Photo must be under 10 MB." });
  }
  if (error instanceof SyntaxError && Object.hasOwn(error, "body")) {
    return res.status(400).json({ error: "Request body must contain valid JSON." });
  }
  if (error.status === 413) return res.status(413).json({ error: "Request is too large." });
  if (error instanceof multer.MulterError) return res.status(400).json({ error: "The uploaded file could not be processed." });
  console.error("Request failed:", error.message);
  res.status(500).json({ error: "The server could not complete that request." });
});

app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));

const clientDist = path.resolve(here, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res, next) => res.sendFile(path.join(clientDist, "index.html"), (error) => error && next()));

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI).catch((error) => console.error("MongoDB connection failed:", error.message));
} else {
  console.warn("MONGODB_URI is not set; saved tracks are disabled.");
}
app.listen(port, () => console.log(`Moodwave server listening at http://localhost:${port}`));
