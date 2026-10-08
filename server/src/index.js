import "dotenv/config";
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 5000);
const pythonApi = process.env.PYTHON_API_URL || "http://127.0.0.1:8000";
const here = path.dirname(fileURLToPath(import.meta.url));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: "1mb" }));

const songSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 240 },
  artist: { type: String, required: true, maxlength: 240 },
  url: { type: String, required: true, unique: true },
  thumbnail: { type: String, default: "" },
}, { timestamps: true });
const SavedSong = mongoose.model("SavedSong", songSchema);

app.get("/api/health", async (_req, res) => {
  let python = false;
  try {
    const response = await fetch(`${pythonApi}/health`, { signal: AbortSignal.timeout(2500) });
    python = response.ok;
  } catch { /* the UI receives a useful status instead of an unhandled rejection */ }
  res.json({ status: "ok", python, mongo: mongoose.connection.readyState === 1 });
});

app.post("/api/detect", upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose a photo first." });
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
  const { emotion, genre, goal, language, likedTracks = [], dislikedIds = [] } = req.body || {};
  const form = new FormData();
  form.append("emotion", String(emotion || ""));
  form.append("genre", String(genre || "Let the mood decide"));
  form.append("goal", String(goal || "Match my mood"));
  form.append("language", String(language || "No preference"));
  form.append("liked_tracks", JSON.stringify(Array.isArray(likedTracks) ? likedTracks.slice(0, 5) : []));
  form.append("disliked_ids", JSON.stringify(Array.isArray(dislikedIds) ? dislikedIds.slice(0, 50) : []));
  try {
    const response = await fetch(`${pythonApi}/recommendations`, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
    const payload = await response.json();
    res.status(response.status).json(payload);
  } catch {
    res.status(503).json({ error: "Could not reach the Python music service. Check that it is running on port 8000." });
  }
});

app.get("/api/favorites", async (_req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "MongoDB is not connected." });
  try { res.json(await SavedSong.find().sort({ createdAt: -1 }).limit(100).lean()); }
  catch { res.status(500).json({ error: "Could not load saved tracks." }); }
});

app.post("/api/favorites", async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "MongoDB is not connected." });
  const { title, artist, url, thumbnail = "" } = req.body || {};
  if (!title || !artist || !url || !String(url).startsWith("https://music.youtube.com/")) {
    return res.status(400).json({ error: "A valid YouTube Music track is required." });
  }
  try {
    const song = await SavedSong.findOneAndUpdate({ url }, { title, artist, url, thumbnail }, { upsert: true, new: true, runValidators: true });
    res.status(201).json(song);
  } catch { res.status(500).json({ error: "Could not save this track." }); }
});

app.delete("/api/favorites/:id", async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "MongoDB is not connected." });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid saved track." });
  try { await SavedSong.findByIdAndDelete(req.params.id); res.status(204).end(); }
  catch { res.status(500).json({ error: "Could not remove this track." }); }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Photo must be under 10 MB." });
  }
  console.error("Request failed:", error.message);
  res.status(500).json({ error: "The server could not complete that request." });
});

const clientDist = path.resolve(here, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res, next) => res.sendFile(path.join(clientDist, "index.html"), (error) => error && next()));

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI).catch((error) => console.error("MongoDB connection failed:", error.message));
} else {
  console.warn("MONGODB_URI is not set; saved tracks are disabled.");
}
app.listen(port, () => console.log(`Moodwave server listening at http://localhost:${port}`));
