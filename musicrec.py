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


def get_recommendations(emotion, ytmusic):
    query = EMOTION_QUERIES.get(emotion, EMOTION_QUERIES["neutral"])
    if ytmusic is not None:
        try:
            results = ytmusic.search(query, filter="songs") or []
            songs = []
            for song in results:
                title = song.get("title")
                artists = song.get("artists") or []
                artist = artists[0].get("name") if artists else None
                if title and artist:
                    songs.append((title, artist))
                if len(songs) == 5:
                    break
            if songs:
                return songs, True
        except Exception:
            pass
    return FALLBACK_RECOMMENDATIONS.get(emotion, FALLBACK_RECOMMENDATIONS["neutral"]), False


st.title("🎵 Emotion Based Music Recommender")
st.caption("Take a photo to estimate your current emotion and get song suggestions.")

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
    tracks, live_results = get_recommendations(emotion, load_ytmusic())
    if not live_results:
        st.caption("Showing built-in suggestions because YouTube Music search is unavailable.")
    for index, (title, artist) in enumerate(tracks, start=1):
        st.write(f"**{index}. {title}** — {artist}")
