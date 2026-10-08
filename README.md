# Moodwave

Moodwave combines the existing TensorFlow emotion classifier with a React music discovery UI. The Python service predicts an emotion from a photo and searches YouTube Music; Express provides the app API and stores saved tracks in MongoDB.

## Requirements

- Python 3.11 and the packages in `requirements.txt`
- Node.js 20 or newer
- MongoDB running locally, or a MongoDB Atlas connection string (required for accounts, playlists, saved tracks, feedback, and synced history)

Moodwave supports email/password accounts. Passwords are stored as scrypt hashes, and sessions use signed HTTP-only cookies. Each user's library and activity are scoped to their account. Use HTTPS and set a unique `SESSION_SECRET` before deployment.

## Run locally on Windows PowerShell

Use a project-local virtual environment so the website, model training script, and dependencies all use Python 3.11. From this project folder, confirm `python --version` reports 3.11, then run:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If PowerShell blocks activation, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that terminal, then activate the environment. Install Python 3.11 and enable **Add Python to PATH** if needed. Close and reopen PowerShell after installation.

Install the React and Express dependencies. Use `npm.cmd` in PowerShell if the `npm` command is blocked by the execution policy:

```powershell
npm.cmd install
```

Configure MongoDB and account sessions:

```powershell
Copy-Item server/.env.example server/.env
```

Edit `server/.env` and set `MONGODB_URI` to your local database or Atlas connection string. Replace `SESSION_SECRET` with a long random value. Account email verification and password recovery use the Resend email API: set `EMAIL_API_KEY`, a verified `EMAIL_FROM`, and the public `PUBLIC_APP_URL`. In local development, verification/reset links are shown directly in the account dialog if email credentials are empty. Keep `.env` private. Mood discovery still works without MongoDB, but account features are disabled.

With `.venv` activated, start all three app services from the project root. Keeping the environment activated matters because the Python emotion service uses the active `python` command:

```powershell
npm.cmd run dev
```

Open the Vite URL printed in the terminal, usually `http://localhost:5173`. The React app calls Express on port 5000, which forwards photo analysis to FastAPI on port 8000. MongoDB stores account data and private libraries.

## Features

- Private accounts with saved tracks and personal playlists.
- Feedback saved to your account and used to rank future mixes.
- Recommendation explanations based on mood, preferences, and your feedback.
- Mood mix and listening history, plus a persistent next/previous player queue.
- Privacy controls to clear history and feedback or delete your account and its data.

## Production deployment with Docker Compose

Install Docker Desktop, copy `.env.example` to `.env`, replace `SESSION_SECRET` with a unique random secret, and configure the email provider values before enabling account registration in production. Then run:

```powershell
docker compose up --build -d
```

Open `http://localhost:5000`. Compose starts the web app, Python emotion API, and MongoDB with persistent storage. The web server revalidates the HTML page and applies long-lived immutable caching to fingerprinted JavaScript and CSS bundles. Put a TLS reverse proxy in front of the app for public deployments. Keep `.env` and database backups private. To stop the services, run `docker compose down`; the database volume remains. To remove it too, run `docker compose down -v`.

The existing Streamlit app can still be started separately with `python -m streamlit run musicrec.py`.

Train the emotion model with the same active environment by running `python train_model.py`. Keep the image scaling (`0–1`) and seven class folder names/order consistent with `emotion_api.py`; the training script checks the labels before starting.

## YouTube Music search

Live search uses the existing `browser.json` if present. To create it, run `python setup_ytmusic.py` and follow the interactive prompt. Keep browser credentials local; do not commit `browser.json` or paste its contents into source files. Built-in mood suggestions remain available if live search is unavailable.

## Project layout

- `client/` — React + Vite frontend
- `server/` — Express API and MongoDB saved-track model
- `emotion_api.py` — FastAPI adapter around the TensorFlow model and YouTube Music search
- `musicrec.py` — original Streamlit interface
