"""HTTP adapter for the existing emotion model and music recommendation logic."""

from pathlib import Path

import cv2
import numpy as np
import tensorflow as tf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ytmusicapi import YTMusic

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "emotion_model.h5"
LABELS = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
MOOD_QUERY = {
    "happy": "upbeat pop songs", "sad": "soft acoustic songs", "angry": "rock songs",
    "neutral": "lofi chill songs", "surprise": "energetic dance songs",
    "fear": "calm ambient songs", "disgust": "alternative songs",
}
GOAL_QUERY = {"Match my mood": "", "Lift my mood": "uplifting feel good", "Help me relax": "calm relaxing"}
FALLBACK = {
    "happy": [("Good as Hell", "Lizzo"), ("Levitating", "Dua Lipa"), ("Flowers", "Miley Cyrus"), ("Can't Stop the Feeling!", "Justin Timberlake"), ("Firework", "Katy Perry")],
    "sad": [("Someone Like You", "Adele"), ("All I Want", "Kodaline"), ("Say You Won't Let Go", "James Arthur"), ("The Night We Met", "Lord Huron"), ("Perfect", "Ed Sheeran")],
    "angry": [("Eye of the Tiger", "Survivor"), ("The Pretender", "Foo Fighters"), ("Back in Black", "AC/DC"), ("Believer", "Imagine Dragons"), ("Killing in the Name", "Rage Against the Machine")],
    "neutral": [("Dreams", "Fleetwood Mac"), ("Sunflower", "Post Malone & Swae Lee"), ("Weightless", "Marconi Union"), ("Stay", "The Kid LAROI & Justin Bieber"), ("Golden", "Harry Styles")],
    "surprise": [("Don't Start Now", "Dua Lipa"), ("Titanium", "David Guetta ft. Sia"), ("Crazy in Love", "Beyoncé"), ("Party Rock Anthem", "LMFAO"), ("Can't Hold Us", "Macklemore & Ryan Lewis")],
    "fear": [("A Thousand Years", "Christina Perri"), ("Weightless", "Marconi Union"), ("Night Lights", "The xx"), ("Ophelia", "The Lumineers"), ("Breathe", "The Prodigy")],
    "disgust": [("Bitter Sweet Symphony", "The Verve"), ("Radioactive", "Imagine Dragons"), ("The Middle", "Jimmy Eat World"), ("My Own Summer", "Deftones"), ("Take Me Out", "Franz Ferdinand")],
}

app = FastAPI(title="Moodwave Emotion Music API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
_model = None
_ytmusic = None


def get_model():
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"{MODEL_PATH.name} is missing")
        _model = tf.keras.models.load_model(MODEL_PATH)
    return _model


def get_ytmusic():
    global _ytmusic
    if _ytmusic is None:
        browser_auth = ROOT / "browser.json"
        try:
            _ytmusic = YTMusic(str(browser_auth)) if browser_auth.exists() else YTMusic()
        except Exception:
            _ytmusic = False
    return None if _ytmusic is False else _ytmusic


def classify(image_bytes):
    decoded = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    if decoded is None:
        raise ValueError("The uploaded image could not be decoded.")
    rgb = cv2.cvtColor(decoded, cv2.COLOR_BGR2RGB)
    batch = np.expand_dims(cv2.resize(rgb, (224, 224)).astype(np.float32) / 255.0, 0)
    probabilities = np.asarray(get_model().predict(batch, verbose=0))[0]
    if probabilities.size != len(LABELS):
        raise ValueError("The model output does not match the seven emotion labels.")
    index = int(np.argmax(probabilities))
    return LABELS[index], float(probabilities[index])


def find_tracks(emotion, genre, goal):
    query_parts = [MOOD_QUERY.get(emotion, MOOD_QUERY["neutral"])]
    if genre and genre != "Let the mood decide":
        query_parts.append(genre)
    if goal in GOAL_QUERY and GOAL_QUERY[goal]:
        query_parts.append(GOAL_QUERY[goal])
    query = " ".join(query_parts + ["songs"])
    client = get_ytmusic()
    if client:
        try:
            results = client.search(query, filter="songs", limit=20) or []
            tracks, seen = [], set()
            for item in results:
                video_id = item.get("videoId")
                artists = item.get("artists") or []
                if not video_id or video_id in seen or not item.get("title"):
                    continue
                seen.add(video_id)
                tracks.append({
                    "title": item["title"],
                    "artist": artists[0].get("name", "Unknown artist") if artists else "Unknown artist",
                    "url": f"https://music.youtube.com/watch?v={video_id}",
                    "thumbnail": (item.get("thumbnails") or [{}])[-1].get("url"),
                })
                if len(tracks) == 8:
                    break
            if tracks:
                return tracks, "youtube_music", query
        except Exception:
            pass
    tracks = [{"title": title, "artist": artist, "url": None, "thumbnail": None}
              for title, artist in FALLBACK.get(emotion, FALLBACK["neutral"])]
    return tracks, "built_in", query


@app.get("/health")
def health():
    return {"status": "ok", "model_available": MODEL_PATH.exists()}


@app.post("/recommendations")
async def recommendations(
    photo: UploadFile = File(...),
    genre: str = Form("Let the mood decide"),
    goal: str = Form("Match my mood"),
):
    if photo.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, or WebP photo.")
    image = await photo.read()
    if not image or len(image) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Photo must be under 10 MB.")
    try:
        emotion, confidence = classify(image)
        tracks, source, query = find_tracks(emotion, genre, goal)
        return {"emotion": emotion, "confidence": confidence, "tracks": tracks, "source": source, "query": query}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"The emotion service is unavailable: {exc}") from exc
