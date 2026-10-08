"""HTTP adapter for the existing emotion model and music recommendation logic."""

import json
import logging
import re
from contextlib import asynccontextmanager
from functools import partial
from pathlib import Path
from urllib.parse import quote

import cv2
import numpy as np
import requests
import tensorflow as tf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ytmusicapi import YTMusic

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "emotion_model.h5"
LABELS = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
PIXEL_SCALE = 1.0 / 255.0
MOOD_QUERY = {
    "happy": "upbeat pop songs", "sad": "soft acoustic songs", "angry": "rock songs",
    "neutral": "lofi chill songs", "surprise": "energetic dance songs",
    "fear": "calm ambient songs", "disgust": "alternative songs",
}
GOAL_QUERY = {"Match my mood": "", "Lift my mood": "uplifting feel good", "Help me relax": "calm relaxing"}
LANGUAGE_QUERY = {
    "No preference": "", "English": "English", "Hindi": "Hindi", "Tamil": "Tamil",
    "Telugu": "Telugu", "Kannada": "Kannada", "Malayalam": "Malayalam",
    "Punjabi": "Punjabi", "Bengali": "Bengali", "Marathi": "Marathi",
    "Gujarati": "Gujarati", "Urdu": "Urdu", "Korean": "Korean",
    "Japanese": "Japanese", "Spanish": "Spanish", "French": "French",
    "Arabic": "Arabic", "Instrumental / no vocals": "instrumental no vocals",
}
FALLBACK = {
    "happy": [("Good as Hell", "Lizzo"), ("Levitating", "Dua Lipa"), ("Flowers", "Miley Cyrus"), ("Can't Stop the Feeling!", "Justin Timberlake"), ("Firework", "Katy Perry")],
    "sad": [("Someone Like You", "Adele"), ("All I Want", "Kodaline"), ("Say You Won't Let Go", "James Arthur"), ("The Night We Met", "Lord Huron"), ("Perfect", "Ed Sheeran")],
    "angry": [("Eye of the Tiger", "Survivor"), ("The Pretender", "Foo Fighters"), ("Back in Black", "AC/DC"), ("Believer", "Imagine Dragons"), ("Killing in the Name", "Rage Against the Machine")],
    "neutral": [("Dreams", "Fleetwood Mac"), ("Sunflower", "Post Malone & Swae Lee"), ("Weightless", "Marconi Union"), ("Stay", "The Kid LAROI & Justin Bieber"), ("Golden", "Harry Styles")],
    "surprise": [("Don't Start Now", "Dua Lipa"), ("Titanium", "David Guetta ft. Sia"), ("Crazy in Love", "Beyoncé"), ("Party Rock Anthem", "LMFAO"), ("Can't Hold Us", "Macklemore & Ryan Lewis")],
    "fear": [("A Thousand Years", "Christina Perri"), ("Weightless", "Marconi Union"), ("Night Lights", "The xx"), ("Ophelia", "The Lumineers"), ("Breathe", "The Prodigy")],
    "disgust": [("Bitter Sweet Symphony", "The Verve"), ("Radioactive", "Imagine Dragons"), ("The Middle", "Jimmy Eat World"), ("My Own Summer", "Deftones"), ("Take Me Out", "Franz Ferdinand")],
}

@asynccontextmanager
async def lifespan(_app):
    warm_model()
    yield


app = FastAPI(title="Moodwave Emotion Music API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
_model = None
_ytmusic = None
logger = logging.getLogger("moodwave.emotion")


def get_model():
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"{MODEL_PATH.name} is missing")
        _model = tf.keras.models.load_model(MODEL_PATH)
    return _model


def warm_model():
    try:
        get_model()
    except Exception:
        logger.exception("Emotion model could not be loaded during startup")


def get_ytmusic():
    global _ytmusic
    if _ytmusic is None:
        browser_auth = ROOT / "browser.json"
        try:
            session = requests.Session()
            # Bound provider latency so an unavailable music endpoint falls
            # back to playable search links instead of timing out the app.
            setattr(session, "request", partial(session.request, timeout=(3, 5)))
            _ytmusic = YTMusic(str(browser_auth), requests_session=session) if browser_auth.exists() else YTMusic(requests_session=session)
        except Exception:
            _ytmusic = False
    return _ytmusic if isinstance(_ytmusic, YTMusic) else None


def classify(image_bytes):
    decoded = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    if decoded is None:
        raise ValueError("The uploaded image could not be decoded.")
    if decoded.shape[0] * decoded.shape[1] > 40_000_000:
        raise ValueError("The image dimensions are too large. Choose a smaller photo.")
    rgb = cv2.cvtColor(decoded, cv2.COLOR_BGR2RGB)
    # Must match train_model.py so the bundled model sees the same input range.
    batch = np.expand_dims(cv2.resize(rgb, (224, 224)).astype(np.float32) * PIXEL_SCALE, 0)
    probabilities = np.asarray(get_model().predict(batch, verbose=0))[0]
    if probabilities.size != len(LABELS):
        raise ValueError("The model output does not match the seven emotion labels.")
    index = int(np.argmax(probabilities))
    return LABELS[index], float(probabilities[index])


def feedback_score(candidate, liked_tracks, disliked_tracks):
    """Rank candidates from recent local likes/dislikes; this is not model retraining."""
    def words(track):
        text = f"{track.get('title', '')} {track.get('artist', '')}".lower()
        return set(re.findall(r"[a-z0-9]+", text)) - {"the", "and", "a", "of", "to", "by", "in"}

    candidate_words = words(candidate)
    candidate_artist = candidate.get("artist", "").strip().casefold()
    score = 0.0
    for examples, direction in ((liked_tracks, 1.0), (disliked_tracks, -1.0)):
        for position, example in enumerate(examples[:10]):
            if not isinstance(example, dict):
                continue
            example_artist = example.get("artist", "").strip().casefold()
            example_words = words(example)
            overlap = len(candidate_words & example_words) / max(1, len(example_words))
            recency_weight = 1.0 / (1 + position * 0.2)
            score += direction * recency_weight * (2.5 * (candidate_artist == example_artist and bool(example_artist)) + overlap)
    return score


def find_tracks(emotion, genre, goal, language, liked_tracks=None, disliked_ids=None, disliked_tracks=None):
    query_parts = [MOOD_QUERY.get(emotion, MOOD_QUERY["neutral"])]
    if genre and genre != "Let the mood decide":
        query_parts.append(genre)
    if goal in GOAL_QUERY and GOAL_QUERY[goal]:
        query_parts.append(GOAL_QUERY[goal])
    language_query = LANGUAGE_QUERY.get(language, "")
    if language_query:
        query_parts.append(language_query)
    liked_tracks = liked_tracks or []
    disliked_tracks = disliked_tracks or []
    disliked_ids = set(disliked_ids or [])
    if liked_tracks:
        similar_to = ", ".join(
            f"{track.get('title', '')} by {track.get('artist', '')}"
            for track in liked_tracks[:3]
            if isinstance(track, dict) and (track.get("title") or track.get("artist"))
        )
        if similar_to:
            query_parts.append(f"similar to {similar_to}")
    query = " ".join(query_parts + ["songs"])
    client = get_ytmusic()
    if client:
        try:
            results = client.search(query, filter="songs", limit=20) or []
            tracks, seen = [], set()
            for item in results:
                video_id = item.get("videoId")
                artists = item.get("artists") or []
                if not video_id or video_id in seen or video_id in disliked_ids or not item.get("title"):
                    continue
                seen.add(video_id)
                tracks.append({
                    "videoId": video_id,
                    "title": item["title"],
                    "artist": artists[0].get("name", "Unknown artist") if artists else "Unknown artist",
                    "url": f"https://music.youtube.com/watch?v={video_id}",
                    "thumbnail": (item.get("thumbnails") or [{}])[-1].get("url"),
                })
                if len(tracks) == 8:
                    break
            if tracks:
                tracks.sort(key=lambda track: feedback_score(track, liked_tracks, disliked_tracks), reverse=True)
                return tracks, "youtube_music", query
        except Exception:
            pass
    # Built-in songs are English-language tracks. Do not quietly return them
    # when the user explicitly asked for a different language.
    if language not in {"No preference", "English"}:
        return [], "unavailable", query
    tracks = [
        {
            "title": title,
            "artist": artist,
            # An external search is still playable when the provider API is down.
            "url": "https://music.youtube.com/search?q=" + quote(f"{title} {artist}"),
            "thumbnail": None,
            "isFallback": True,
        }
        for title, artist in FALLBACK.get(emotion, FALLBACK["neutral"])
    ]
    tracks.sort(key=lambda track: feedback_score(track, liked_tracks, disliked_tracks), reverse=True)
    return tracks, "built_in", query


@app.get("/health")
def health():
    ready = _model is not None
    return {"status": "ok" if ready else "degraded", "model_available": ready}


@app.post("/detect")
async def detect_emotion(
    photo: UploadFile = File(...),
):
    if photo.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, or WebP photo.")
    image = await photo.read()
    if not image or len(image) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Photo must be under 10 MB.")
    try:
        emotion, confidence = classify(image)
        return {"emotion": emotion, "confidence": confidence}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Emotion detection failed")
        raise HTTPException(status_code=503, detail="Emotion analysis is temporarily unavailable. Please try again.") from exc


@app.post("/recommendations")
def recommendations(
    emotion: str = Form(...),
    genre: str = Form("Let the mood decide"),
    goal: str = Form("Match my mood"),
    language: str = Form("No preference"),
    liked_tracks: str = Form("[]"),
    disliked_ids: str = Form("[]"),
    disliked_tracks: str = Form("[]"),
):
    if emotion not in LABELS:
        raise HTTPException(status_code=422, detail="Choose a valid detected mood.")
    if language not in LANGUAGE_QUERY:
        raise HTTPException(status_code=422, detail="Choose a supported language preference.")
    try:
        liked = json.loads(liked_tracks)
        disliked = json.loads(disliked_ids)
        disliked_examples = json.loads(disliked_tracks)
        if not isinstance(liked, list) or not isinstance(disliked, list) or not isinstance(disliked_examples, list):
            raise ValueError("Feedback data must be lists.")
        if not all(isinstance(item, dict) for item in liked + disliked_examples):
            raise ValueError("Feedback examples must be objects.")
        disliked = [item for item in disliked if isinstance(item, str)]
        tracks, source, query = find_tracks(emotion, genre, goal, language, liked, disliked, disliked_examples)
        for track in tracks:
            taste_score = feedback_score(track, liked, disliked_examples)
            if taste_score > 0:
                track["reason"] = "Matches artists or songs you liked"
            elif taste_score < 0:
                track["reason"] = "A fresh pick based on your mood and preferences"
            elif source == "built_in":
                track["reason"] = f"A {emotion} mood pick"
            else:
                track["reason"] = f"Matches your {emotion} mood · {goal.lower()}"
        return {"emotion": emotion, "tracks": tracks, "source": source, "query": query, "language": language, "personalized": bool(liked or disliked_examples)}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Feedback data was malformed.") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Music search is unavailable: {exc}") from exc
