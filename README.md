# LazyFlow AI

**Slow down. Get it done.** LazyFlow is a private, local-first assistant for the repetitive work that quietly eats a day: sorting files, finding the gist in notes, and choosing one next step. Its core utilities work offline; optional AI runs on your computer through [Ollama](https://ollama.com/).

> Built for the DEV Community Hacktoberfest 2026 challenge, **“Slow and Steady.”**

## What it does

- **Local AI chat:** chat with an open-weight model served by local Ollama. The dashboard shows whether Ollama and the selected model are available, with setup guidance when they are not.
- **Safe file organizer:** preview organization by type, modified month, custom extension category, or saved rules. Review moves and explicitly confirm them. Existing files are never overwritten; supported moves can be undone from the activity log.
- **Daily digest and summaries:** create a summary and extract explicit reminders from pasted notes or a local `.txt`, `.md`, or `.log` file. Text falls back to an offline extractive summary if Ollama is unavailable.
- **Focus mode:** get one of several small, offline calming exercises.
- **Automation rules:** save simple extension-to-folder rules. Rules never run in the background; use them in an organizer preview and confirm the proposed moves.
- **Activity log:** see recent local actions and undo file moves.
- **Responsive dashboard:** quick actions, local AI status, offline indicators, privacy notes, and clear empty/loading/error states.

## Project layout

```text
.
├── backend/
│   ├── app/
│   │   ├── ai.py              # Ollama connection and offline text helpers
│   │   ├── main.py            # FastAPI routes and request validation
│   │   ├── organizer.py       # Preview, safe file moves, and undo
│   │   └── store.py           # SQLite activity and rule storage
│   ├── tests/                 # pytest unit and API tests
│   └── requirements.txt
├── sample-data/
│   └── daily-notes.txt        # Safe sample input for the digest
├── src/
│   ├── api.ts                 # Typed frontend API client
│   ├── App.tsx                # Dashboard and feature views
│   └── styles.css             # Responsive Tailwind-enabled UI styling
├── .env.example
├── package.json
└── README.md
```

## Prerequisites

- Python 3.10 or newer
- Node.js 20 or newer and npm
- (Optional, for AI features) [Ollama](https://ollama.com/download) and enough memory for your chosen model

No cloud account or API key is required. The app binds to loopback by default and sends AI prompts only to a local Ollama endpoint.

## Run locally

From the repository root:

1. **Set up the backend**

   ```bash
   python -m venv .venv
   source .venv/bin/activate        # Windows PowerShell: .venv\Scripts\Activate.ps1
   python -m pip install -r backend/requirements.txt
   cp .env.example .env             # Windows: Copy-Item .env.example .env
   python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
   ```

   The API docs are at <http://127.0.0.1:8000/docs>. The SQLite database is created at `~/.lazyflow-ai/lazyflow.sqlite3` on first start.

2. **Set up the frontend** in a second terminal:

   ```bash
   npm install
   npm run dev
   ```

   Open <http://127.0.0.1:5173>. To use a different backend URL, set `VITE_API_URL` in the root `.env` file (for example, `VITE_API_URL=http://127.0.0.1:8000`).

3. **Enable local AI (optional)**

   - Install Ollama using the official [download and installation guide](https://ollama.com/download) for macOS, Windows, or Linux.
   - Start the Ollama app/service, then download the default model:

     ```bash
     ollama pull llama3.2:3b
     ```

   - LazyFlow checks `http://127.0.0.1:11434` and looks for `llama3.2:3b`. Set `OLLAMA_MODEL` in `.env` to another model installed in Ollama, such as `gemma3:4b`. The model name must be available to `ollama run <model>`.
   - If Ollama is already running at another **loopback** address/port, set `OLLAMA_BASE_URL`. Remote hosts are rejected intentionally.

Start the backend and frontend independently. Stop either with `Ctrl+C`. The app works without Ollama; chat is disabled and summaries use a basic offline fallback.

## Try a demo

1. Open **Daily Digest**, choose **Load a .txt file**, and select `sample-data/daily-notes.txt`. Create the digest and inspect the reminders.
2. Open **File Organizer**. In a disposable test folder, create a few sample files (for example `photo.png`, `notes.txt`, and `archive.zip`). Enter the folder’s **absolute path**, choose **File type**, then create a preview.
3. Check the proposed moves and click **Review and confirm**. Confirm only after reviewing. Return to the dashboard and use **Undo** in Recent activity to restore the files.
4. Add an extension rule in **Automation Rules**, then select **My automation rules** in the organizer to preview it.
5. Try **Focus Mode**, then install Ollama and refresh **Settings** to demonstrate the local model connection and chat.

**Never test file operations on a folder containing important data.** LazyFlow moves files; it does not delete files, but backups are still good practice.

### Capture a demo screenshot

Run both servers and open the dashboard at `http://127.0.0.1:5173`. Resize the browser to show the desktop or mobile layout, then use your operating system’s screenshot shortcut or browser developer tools. A good submission set is the dashboard, a populated organizer preview before confirmation, and the local AI setup/status view. Do not include personal filenames or notes in published screenshots.

## API overview

All endpoints are under `/api`:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | API, Ollama/model status, and offline tools |
| `POST` | `/organizer/preview` | Scan an explicitly selected root and prepare a dry-run plan |
| `POST` | `/organizer/confirm` | Apply a previously generated plan |
| `POST` | `/organizer/undo/{activity_id}` | Reverse a supported organizer action |
| `POST` | `/summarize` | Summarize text, using local AI or offline fallback |
| `POST` | `/digest` | Summarize text and extract explicit task-like lines |
| `GET` | `/focus` | Return an offline focus exercise |
| `GET`, `POST`, `DELETE` | `/rules` | List, save, and delete local automation rules |
| `GET` | `/activity` | List local activity and undo availability |
| `POST` | `/chat` | Send a prompt to the local Ollama model |

## Architecture and privacy

The React/TypeScript frontend uses a typed `fetch` client to call FastAPI. Pydantic validates request sizes and shapes. File scanning and moves use Python’s standard library; SQLite stores user-created rules and activity. The Ollama client only permits loopback HTTP hosts, and chat/summarization prompts are not sent to a hosted provider.

The browser reads a text file only after the user selects it, and then submits its text to the local backend. File organization accepts a folder path typed by the user; it scans only that folder, skips hidden directories and symlinks, resolves paths to prevent traversal outside the selected root, previews the plan, and waits for confirmation before moving anything. It does not delete or overwrite files. Undo is available when the original and destination paths remain safe and unchanged.

**Privacy protections are not a security boundary against a compromised computer.** This app is intended for a single trusted user on their own machine, not for public hosting. The API does not implement user authentication. Keep both servers bound to loopback; do not expose them to a network without adding authentication, CSRF protection, and a deployment threat model.

## Offline and model trade-offs

**Works offline:** file scanning/organization, confirmation and undo, automation rule storage, the activity log, focus exercises, local dashboard, and basic extractive summaries/digests.

**Needs Ollama and an installed local model:** chat, AI-quality summaries, and AI-generated daily digests. Ollama itself may need internet access to download its installer/model; inference runs locally after that.

A local open-weight model is useful here because personal notes and prompts can stay on-device, inference works without a provider account after setup, and users can select or replace the model. For private text tasks, keeping content local is a meaningful advantage over a cloud-only assistant. The trade-off is that local inference can be slower, needs storage/RAM/compute, may use less capable models, and can produce inaccurate summaries or malformed output. Verify important tasks and dates. LazyFlow never asks a model to execute code, run commands, or perform file operations.

## Configuration

Copy `.env.example` to `.env`. Supported backend environment variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Must use HTTP on a loopback host |
| `OLLAMA_MODEL` | `llama3.2:3b` | Name of an Ollama model already installed |
| `LAZYFLOW_DB_PATH` | `~/.lazyflow-ai/lazyflow.sqlite3` | Optional path for local SQLite data |
| `VITE_API_URL` | `http://127.0.0.1:8000` | Optional frontend API origin |

Do not put credentials or personal content in `.env`. The file is ignored by Git.

## Tests and build

```bash
python -m pip install -r backend/requirements.txt
python -m pytest backend/tests
npm install
npm run build
```

Tests cover offline utilities, local-only Ollama URL validation, folder traversal/symlink protection, non-overwriting moves, organization/undo, and API validation. The test suite does not need Ollama.

## Limitations and future work

- Directory access requires entering a path in the local UI. A packaged desktop shell could offer a native folder picker and stronger OS-level boundaries.
- The extractive fallback is intentionally simple; it selects representative longer sentences rather than understanding meaning.
- Undo is limited to recorded file moves and requires both paths to remain safe and available. It cannot recover from external edits/deletions.
- Current activity is local and single-user; there is no multi-user authentication, sync, or cloud backup.
- Rules are deliberately manual and predictable, not a background watcher.
- Follow-up improvements could add more robust model-output validation, richer category presets, conflict-resolution UI, a desktop build, and broader accessibility/browser testing.

## Contributing

Small, focused improvements are welcome. Please run the backend tests and frontend build before opening a pull request. Keep privacy and explicit confirmation as product requirements, not optional polish.

## License

MIT. See [LICENSE](./LICENSE).
