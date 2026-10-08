"""Emotion based music recommendations using the trained image classifier."""

import json
from pathlib import Path

import cv2
import numpy as np
import streamlit as st
import tensorflow as tf
from ytmusicapi import YTMusic

st.set_page_config(page_title="Emotion Music Recommender", page_icon="🎵")

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "emotion_model.h5"
IMAGE_SIZE = (224, 224)

# Keras flow_from_directory assigns class indices in alphabetical order.
CLASS_LABELS = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
EMOTION_QUERIES = {
    "happy": "upbeat pop songs",
    "sad": "soft acoustic songs",
    "angry": "rock songs",
    "neutral": "lofi chill songs",
    "surprise": "energetic dance songs",
    "fear": "calm ambient songs",
    "disgust": "alternative songs",
}
GENRE_OPTIONS = ["Let the mood decide", "Pop", "Rock", "Acoustic", "Electronic", "Lo-fi", "Jazz", "Classical", "Hip-hop", "Indie"]
GOAL_OPTIONS = ["Match my mood", "Lift my mood", "Help me relax"]
GOAL_QUERIES = {
    "Match my mood": "",
    "Lift my mood": "uplifting feel good",
    "Help me relax": "calm relaxing",
}
FALLBACK_RECOMMENDATIONS = {
    "happy": [("Good as Hell", "Lizzo"), ("Levitating", "Dua Lipa"), ("Flowers", "Miley Cyrus"), ("Can't Stop the Feeling!", "Justin Timberlake"), ("Firework", "Katy Perry")],
    "sad": [("Someone Like You", "Adele"), ("All I Want", "Kodaline"), ("Say You Won't Let Go", "James Arthur"), ("The Night We Met", "Lord Huron"), ("Perfect", "Ed Sheeran")],
    "angry": [("Eye of the Tiger", "Survivor"), ("The Pretender", "Foo Fighters"), ("Back in Black", "AC/DC"), ("Believer", "Imagine Dragons"), ("Killing in the Name", "Rage Against the Machine")],
    "neutral": [("Dreams", "Fleetwood Mac"), ("Sunflower", "Post Malone & Swae Lee"), ("Weightless", "Marconi Union"), ("Stay", "The Kid LAROI & Justin Bieber"), ("Golden", "Harry Styles")],
    "surprise": [("Don't Start Now", "Dua Lipa"), ("Titanium", "David Guetta ft. Sia"), ("Crazy in Love", "Beyoncé"), ("Party Rock Anthem", "LMFAO"), ("Can't Hold Us", "Macklemore & Ryan Lewis")],
    "fear": [("A Thousand Years", "Christina Perri"), ("Weightless", "Marconi Union"), ("Night Lights", "The xx"), ("Ophelia", "The Lumineers"), ("Breathe", "The Prodigy")],
    "disgust": [("Bitter Sweet Symphony", "The Verve"), ("Radioactive", "Imagine Dragons"), ("The Middle", "Jimmy Eat World"), ("My Own Summer", "Deftones"), ("Take Me Out", "Franz Ferdinand")],
}


@st.cache_resource(show_spinner="Loading the emotion model...")
def load_model():
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"Model file not found: {MODEL_PATH.name}")
    return tf.keras.models.load_model(MODEL_PATH)


@st.cache_resource(show_spinner=False)
def load_ytmusic():
    """Use optional Streamlit secret auth; public search works without it."""
    try:
        raw_auth = st.secrets.get("YTMUSIC_AUTH", "")
        auth = json.loads(raw_auth) if raw_auth else None
        return YTMusic(auth) if auth else YTMusic()
    except Exception:
        # Search may still work without browser auth. Recommendation fallback
        # below keeps the app usable if remote search is unavailable.
        try:
            return YTMusic()
        except Exception:
            return None


def predict_emotion(image_bytes, model):
    """Decode a camera image and prepare it like the training generator did."""
    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    image_bgr = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image_bgr is None:
        raise ValueError("That image could not be read. Please take another photo.")
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(image_rgb, IMAGE_SIZE)
    batch = np.expand_dims(resized.astype(np.float32) / 255.0, axis=0)

    probabilities = np.asarray(model.predict(batch, verbose=0))[0]
    if probabilities.size != len(CLASS_LABELS):
        raise ValueError(
            f"The model returned {probabilities.size} classes, but this app expects "
            f"{len(CLASS_LABELS)}. Check the training class folders."
        )
    index = int(np.argmax(probabilities))
    return CLASS_LABELS[index], float(probabilities[index])


def get_recommendations(emotion, ytmusic, genre="Let the mood decide", goal="Match my mood", limit=8):
    mood_query = EMOTION_QUERIES.get(emotion, EMOTION_QUERIES["neutral"])
    selected_genre = "" if genre == "Let the mood decide" else genre
    goal_query = GOAL_QUERIES.get(goal, "")
    query = " ".join(part for part in (mood_query, selected_genre, goal_query, "songs") if part)
    if ytmusic is not None:
        try:
            results = ytmusic.search(query, filter="songs", limit=max(limit * 2, 20)) or []
            songs = []
            seen_ids = set()
            for song in results:
                title = song.get("title")
                artists = song.get("artists") or []
                artist = artists[0].get("name") if artists else None
                video_id = song.get("videoId")
                if title and artist and video_id and video_id not in seen_ids:
                    seen_ids.add(video_id)
                    songs.append({
                        "title": title,
                        "artist": artist,
                        "url": f"https://music.youtube.com/watch?v={video_id}",
                        "thumbnail": (song.get("thumbnails") or [{}])[-1].get("url"),
                    })
                if len(songs) == limit:
                    break
            if songs:
                return songs, True, query
        except Exception:
            pass
    fallback = FALLBACK_RECOMMENDATIONS.get(emotion, FALLBACK_RECOMMENDATIONS["neutral"])
    songs = [{"title": title, "artist": artist, "url": None, "thumbnail": None} for title, artist in fallback[:limit]]
    return songs, False, query


st.title("🎵 Emotion Based Music Recommender")
st.caption("Take a photo to estimate your current emotion and get song suggestions.")
col1, col2 = st.columns(2)
with col1:
    selected_genre = st.selectbox("Music style", GENRE_OPTIONS)
with col2:
    recommendation_goal = st.selectbox("What do you want music to do?", GOAL_OPTIONS)

try:
    emotion_model = load_model()
except Exception as exc:
    st.error(f"The emotion model could not be loaded: {exc}")
    st.info("Place emotion_model.h5 in the same folder as musicrec.py.")
    st.stop()

photo = st.camera_input("Take a picture of your face")
if photo is not None:
    try:
        emotion, confidence = predict_emotion(photo.getvalue(), emotion_model)
    except (ValueError, cv2.error) as exc:
        st.error(str(exc))
        st.stop()

    st.subheader(f"Detected emotion: {emotion.capitalize()}")
    st.caption(f"Model confidence: {confidence:.0%}. Emotion predictions can be imperfect.")
    st.subheader("Recommended songs")
    tracks, live_results, search_query = get_recommendations(
        emotion, load_ytmusic(), selected_genre, recommendation_goal
    )
    st.caption(f"Search: {search_query}")
    if not live_results:
        st.caption("Showing built-in suggestions because YouTube Music search is unavailable.")
    for index, track in enumerate(tracks, start=1):
        label = f"**{index}. {track['title']}** — {track['artist']}"
        if track["url"]:
            st.markdown(f"{label}  [Open in YouTube Music]({track['url']})")
        else:
            st.write(label)
