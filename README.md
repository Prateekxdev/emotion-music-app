# Moodwave

Moodwave combines the existing TensorFlow emotion classifier with a React music discovery UI. The Python service predicts an emotion from a photo and searches YouTube Music; Express provides the app API and stores saved tracks in MongoDB.

## Requirements

- Python 3.11 and the packages in `requirements.txt`
- Node.js 20 or newer
- MongoDB running locally, or a MongoDB Atlas connection string (optional; without it, recommendations still work but saving tracks is disabled)

This demo does not include sign-in, so MongoDB saved tracks are shared by everyone using the same deployment. Add accounts before deploying it for multiple private users.

## Run locally on Windows PowerShell

From this project folder, install the Python dependencies:

```powershell
python -m pip install -r requirements.txt
```

If `python` is not recognized, install Python 3.11 and enable **Add Python to PATH**. Close and reopen PowerShell after installation.

Install the React and Express dependencies. Use `npm.cmd` in PowerShell if the `npm` command is blocked by the execution policy:

```powershell
npm.cmd install
```

Configure MongoDB (optional):

```powershell
Copy-Item server/.env.example server/.env
```

Edit `server/.env` and set `MONGODB_URI` to your local database or Atlas connection string. Keep `.env` private.

Start all three app services from the project root:

```powershell
npm.cmd run dev
```

Open the Vite URL printed in the terminal, usually `http://localhost:5173`. The React app calls Express on port 5000, which forwards photo analysis to FastAPI on port 8000. MongoDB is only needed for the saved tracks feature.

The existing Streamlit app can still be started separately with `python -m streamlit run musicrec.py`.

## YouTube Music search

Live search uses the existing `browser.json` if present. To create it, run `python setup_ytmusic.py` and follow the interactive prompt. Keep browser credentials local; do not commit `browser.json` or paste its contents into source files. Built-in mood suggestions remain available if live search is unavailable.

## Project layout

- `client/` — React + Vite frontend
- `server/` — Express API and MongoDB saved-track model
- `emotion_api.py` — FastAPI adapter around the TensorFlow model and YouTube Music search
- `musicrec.py` — original Streamlit interface
