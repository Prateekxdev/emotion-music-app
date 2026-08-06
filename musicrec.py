emotion_music_map = {
    'happy': 'upbeat pop songs',
    'sad': 'soft acoustic songs',
    'angry': 'rock songs',
    'neutral': 'lofi chill songs',
    'surprise': 'energetic dance songs',
    'fear': 'calm ambient songs',
    'disgust': 'alternative songs'
}
import streamlit as st
import cv2
import numpy as np
import tensorflow as tf
from ytmusicapi import YTMusic

model = tf.keras.models.load_model('emotion_model.h5')
import streamlit as st
import json

auth_data = st.secrets["YTMUSIC_AUTH"]
ytmusic = YTMusic(json.loads(auth_data))

class_labels = ['angry', 'disgust', 'fear', 'happy', 'neutral', 'sad', 'surprise']

st.title("🎵 Emotion Based Music Recommender")
img_file = st.camera_input("Take a picture of your face")

if img_file:
    file_bytes = np.asarray(bytearray(img_file.read()), dtype=np.uint8)
    img = cv2.imdecode(file_bytes, 1)
    img_resized = cv2.resize(img, (224, 224))
    img_array = np.expand_dims(img_resized / 255.0, axis=0)

    prediction = model.predict(img_array)
    emotion = class_labels[np.argmax(prediction)]

    st.write(f"### Detected Emotion: {emotion.capitalize()}")

    query = emotion_music_map[emotion]
    results = ytmusic.search(query, filter="songs")

    st.write("### Recommended Songs:")
    for song in results[:5]:
        st.write(f"🎶 {song['title']} — {song['artists'][0]['name']}")
        
        