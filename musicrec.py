"""Emotion based music recommendations using the trained image classifier."""

import json
from pathlib import Path

import cv2
import numpy as np
import streamlit as st
import tensorflow as tf
from ytmusicapi import YTMusic

st.set_page_config(page_title="Moodwave | Music for your mood", page_icon="🎧", layout="wide")

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


st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap');
:root { --ink:#f4f4f7; --muted:#a5a6b5; --line:rgba(255,255,255,.09); --violet:#a78bfa; }
.stApp { background:radial-gradient(ellipse at 85% 0%,rgba(121,82,213,.18),transparent 34%),#0d0e13; color:var(--ink); }
[data-testid="stHeader"] { background:transparent; }
[data-testid="stMainBlockContainer"] { max-width:1240px; padding-top:2rem; padding-bottom:4rem; }
html,body,[class*="css"] { font-family:'DM Sans',sans-serif; }
h1,h2,h3 { font-family:'Manrope',sans-serif !important; letter-spacing:-.035em; }
.hero { position:relative; overflow:hidden; padding:2.2rem 2.4rem; border:1px solid var(--line); border-radius:28px; background:linear-gradient(115deg,rgba(37,32,58,.96),rgba(25,25,35,.94) 58%,rgba(35,24,48,.92)); margin-bottom:1.35rem; }
.hero:after { content:'♫'; position:absolute; right:7%; top:-82px; font-size:250px; line-height:1; color:rgba(221,194,255,.07); font-family:serif; transform:rotate(-12deg); }
.eyebrow { color:#d1b9ff; font-size:.75rem; font-weight:700; letter-spacing:.17em; text-transform:uppercase; }
.hero h1 { color:#fff; font-size:clamp(2.2rem,5vw,3.7rem); line-height:1.08; margin:.55rem 0 .7rem; }
.hero p { color:#c1bdcf; font-size:1.02rem; max-width:580px; margin:0; }
.section-label { color:#f5f1ff; font:700 1.15rem 'Manrope',sans-serif; margin:.2rem 0 .8rem; }
.helper { color:#a7a7b5; font-size:.9rem; line-height:1.55; }
.mood-card { border:1px solid var(--line); border-radius:20px; background:linear-gradient(140deg,#1b1c26,#161720); padding:1.25rem 1.4rem; margin:.4rem 0 1rem; }
.mood-kicker { color:#b7a5df; font-size:.72rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase; }
.mood-name { color:#fff; font:800 2.1rem 'Manrope',sans-serif; margin:.3rem 0; text-transform:capitalize; }
.mood-foot { color:#aaa9b8; font-size:.88rem; }
.track-number { color:#b6a2e8; font-size:.78rem; font-weight:700; }
div[data-testid="stVerticalBlockBorderWrapper"] { background:rgba(23,24,33,.88); border-color:var(--line); border-radius:20px; }
div[data-testid="stSelectbox"] label,div[data-testid="stCameraInput"] label { color:#e7e3f0; font-weight:600; }
div[data-testid="stSelectbox"] div[data-baseweb="select"]>div { background:#181922; border-color:var(--line); border-radius:12px; }
div[data-testid="stLinkButton"] a { border-radius:12px; background:rgba(167,139,250,.13); border:1px solid rgba(167,139,250,.25); color:#ddceff; font-weight:700; }
@media(max-width:700px) { [data-testid="stMainBlockContainer"]{padding:1rem 1rem 3rem}.hero{padding:1.5rem;border-radius:20px}.hero:after{right:-20px;font-size:190px} }
</style>
<section class="hero"><div class="eyebrow">A soundtrack for right now</div><h1>Let your mood<br>pick the music.</h1><p>Check in with yourself, find your sound, and discover tracks that meet you where you are.</p></section>
""", unsafe_allow_html=True)

st.markdown('<div class="section-label">Shape your listening session</div>', unsafe_allow_html=True)
col1, col2 = st.columns(2, gap="large")
with col1:
    selected_genre = st.selectbox("Choose a sound", GENRE_OPTIONS)
with col2:
    recommendation_goal = st.selectbox("Set the vibe", GOAL_OPTIONS)

try:
    emotion_model = load_model()
except Exception as exc:
    st.error(f"The emotion model could not be loaded: {exc}")
    st.info("Place emotion_model.h5 in the same folder as musicrec.py.")
    st.stop()

left, right = st.columns([0.9, 1.1], gap="large")
with left:
    st.markdown('<div class="section-label">01 &nbsp; Mood check-in</div>', unsafe_allow_html=True)
    with st.container(border=True):
        st.markdown('<p class="helper">Use your camera for a quick emotion estimate. Your photo is processed by the app to predict a mood.</p>', unsafe_allow_html=True)
        photo = st.camera_input("Take a photo")
    st.markdown('<p class="helper">A gentle nudge, not a diagnosis. You can retake the photo anytime.</p>', unsafe_allow_html=True)

with right:
    st.markdown('<div class="section-label">02 &nbsp; Your soundtrack</div>', unsafe_allow_html=True)
    if "emotion_result" not in st.session_state:
        st.session_state.emotion_result = None

if photo is not None:
    try:
        photo_bytes = photo.getvalue()
        photo_key = hash(photo_bytes)
        if st.session_state.get("photo_key") != photo_key:
            st.session_state.emotion_result = predict_emotion(photo_bytes, emotion_model)
            st.session_state.photo_key = photo_key
        emotion, confidence = st.session_state.emotion_result
    except (ValueError, cv2.error) as exc:
        st.error(str(exc))
        st.stop()

    with right:
        st.markdown(f'<div class="mood-card"><div class="mood-kicker">Your mood, right now</div><div class="mood-name">{emotion}</div><div class="mood-foot">AI estimate · {confidence:.0%} model confidence</div></div>', unsafe_allow_html=True)
        st.markdown('<div class="helper">The model can be imperfect. Go with the mood that feels right to you.</div>', unsafe_allow_html=True)
        tracks, live_results, search_query = get_recommendations(
            emotion, load_ytmusic(), selected_genre, recommendation_goal
        )
        st.markdown('<div class="section-label" style="margin-top:1.3rem">Made for this moment</div>', unsafe_allow_html=True)
        if not live_results:
            st.caption("Live search is unavailable. Showing saved suggestions for this mood.")
        for index, track in enumerate(tracks, start=1):
            with st.container(border=True):
                art_col, song_col, link_col = st.columns([0.18, 0.58, 0.24], vertical_alignment="center")
                with art_col:
                    if track.get("thumbnail"):
                        st.image(track["thumbnail"], width=64)
                    else:
                        st.markdown(f'<div class="track-number">TRACK<br>{index:02}</div>', unsafe_allow_html=True)
                with song_col:
                    st.write(track["title"])
                    st.caption(track["artist"])
                with link_col:
                    if track.get("url"):
                        st.link_button("Listen ↗", track["url"], use_container_width=True)
                    else:
                        st.caption("Suggested track")
else:
    with right:
        with st.container(border=True):
            st.markdown('<div style="padding:2rem .6rem;text-align:center"><div style="font-size:2.4rem">♫</div><div style="font:700 1.2rem Manrope;color:#f5f1ff;margin:.5rem 0">Your mix is waiting</div><div class="helper">Take a photo to reveal your mood and build a soundtrack around it.</div></div>', unsafe_allow_html=True)
