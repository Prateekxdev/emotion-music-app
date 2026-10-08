# Moodwave

Moodwave combines the existing TensorFlow emotion classifier with a React music discovery UI. The Python service predicts an emotion from a photo and searches YouTube Music; Express provides the app API and stores saved tracks in MongoDB. The frontend can run on Vercel while the Node and Python APIs run as separate Docker services.

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

Edit `server/.env` and set `MONGODB_URI` to your local database or Atlas connection string. Set `WEB_ORIGIN` to the exact frontend origin. Replace `SESSION_SECRET` with a long random value. Account email verification and password recovery use the Resend email API: set `EMAIL_API_KEY`, a verified `EMAIL_FROM`, and the public `PUBLIC_APP_URL`. In local development, verification/reset links are shown directly in the account dialog if email credentials are empty. Keep `.env` private. Mood discovery still works without MongoDB, but account features are disabled.

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

Install Docker Desktop, copy `.env.example` to `.env`, replace `SESSION_SECRET` with a unique random secret, set `WEB_ORIGIN` to the public origin, and configure the email provider values before enabling account registration in production. Then run:

```powershell
docker compose up --build -d
```

Open `http://localhost:5000`. Compose starts the web app, Python emotion API, and MongoDB with persistent storage. The web server revalidates the HTML page and applies long-lived immutable caching to fingerprinted JavaScript and CSS bundles. Put a TLS reverse proxy in front of the app for public deployments. Keep `.env` and database backups private. To stop the services, run `docker compose down`; the database volume remains. To remove it too, run `docker compose down -v`.

The existing Streamlit app can still be started separately with `python -m streamlit run python/musicrec.py`.

Train the emotion model with the same active environment by running `python python/train_model.py`. Keep the image scaling (`0–1`) and seven class folder names/order consistent with `python/emotion_api.py`; the training script checks the labels before starting.

## YouTube Music search

Live search uses the existing `browser.json` if present. To create it, run `python python/setup_ytmusic.py` from the project root and follow the interactive prompt. Keep browser credentials local; do not commit `browser.json` or paste its contents into source files. Built-in mood suggestions remain available if live search is unavailable.

## Deploy frontend to Vercel and APIs separately

### Vercel frontend

Create a Vercel project from this repository with the **repository root** as the project root. `vercel.json` sets the install command, workspace build command, and `client/dist` output directory. Set this Vercel environment variable for Production and Preview:

- `VITE_API_URL` — the HTTPS origin of the Node API, with no trailing slash (for example `https://api.example.com`)

Deploy the project after setting the environment variable; Vite embeds it at build time.

### Node API service

Deploy the repository as a Docker service using `Dockerfile.server` and the repository root as the build context. Expose port `5000`. Configure:

- `NODE_ENV=production`
- `PORT=5000` (or the port required by the host)
- `WEB_ORIGIN=https://app.example.com` — exact frontend origin, without a trailing slash
- `PYTHON_API_URL=https://emotion-api.example.com` — the Python API origin
- `MONGODB_URI` — a persistent MongoDB connection string
- `SESSION_SECRET` — a unique random secret of at least 32 characters
- `PUBLIC_APP_URL=https://app.example.com`
- `EMAIL_API_KEY` and `EMAIL_FROM` — verified Resend credentials for account verification and password reset

`WEB_ORIGIN` can contain comma-separated exact origins when you need to allow preview frontends. Do not use `*`.

### Python emotion API service

Deploy the repository as a second Docker service using `Dockerfile.python` and the repository root as the build context. Expose port `8000`; set the Node API's `PYTHON_API_URL` to this service's reachable HTTPS origin. It loads the tracked `emotion_model.h5` during startup. Keep this service private to the Node API when your hosting provider supports private networking.

### Domains, accounts, and checks

For reliable browser sign-in, use HTTPS custom domains on the same site (for example `app.example.com` and `api.example.com`). The session cookie is secure and `SameSite=Lax`; browsers may block it when the Vercel frontend and API are on unrelated provider domains. Set `WEB_ORIGIN` to the actual frontend origin and `PUBLIC_APP_URL` to the actual frontend URL.

Set the Node service health-check path to `/api/health`. Allow it to connect to MongoDB Atlas from your hosting provider, and do not expose the Python service publicly unless needed. After deployment, check `https://api.example.com/api/health`, then verify photo detection, recommendations, account verification email, sign-in, and the private library. `model_available` should be `true`; account/library operations require MongoDB and account email requires Resend configuration.

## Project layout

- `client/` — React + Vite frontend
- `server/` — Express API and MongoDB saved-track model
- `python/` — FastAPI emotion API, original Streamlit interface, model training, YouTube Music setup, and YouTube Music smoke test
- `client/public/assets/` — logo and other static image assets
- `requirements.txt` — full local Python environment, including the legacy Streamlit app
- `requirements-api.txt` — lean Python API container dependencies
- `Dockerfile.server` — standalone Node API container
- `Dockerfile.python` — standalone Python emotion API container
- `vercel.json` — Vercel frontend build configuration
