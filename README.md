# Vocabulary Quizzer

Vocabulary Quizzer is a browser-based vocabulary review app. It can import words from PDFs or images, run daily review quizzes, grade Chinese meanings with AI, and track progress with a spaced-repetition schedule.

The app does not ship with a hardcoded Gemini key. Each user connects their own OpenAI-compatible API from the Settings page.

## Features

- Import English vocabulary with Chinese meanings from PDFs and images
- Daily quiz flow with spaced repetition
- AI-assisted answer grading
- Manual grading override
- Starred vocabulary book for focused review
- Local browser storage with Dexie/IndexedDB
- User-configurable AI endpoint, API key, and model

## Connect an AI API

Open `Settings` in the app and fill in:

- `Endpoint`: an OpenAI-compatible chat completions endpoint, for example `https://api.example.com/v1/chat/completions`
- `API Key`: optional for local APIs; sent as `Authorization: Bearer <key>` when provided
- `Model`: the model name expected by your endpoint

Your endpoint should support browser CORS requests. Image/PDF import sends file data as browser data URLs in the message content.

Expected response shape:

```json
{
  "choices": [
    {
      "message": {
        "content": "{\"words\":[{\"english\":\"example\",\"chinese\":\"例子\"}]}"
      }
    }
  ]
}
```

For quiz grading, return JSON with a `results` boolean array:

```json
{"results":[true,false,true]}
```

## Run Locally

Prerequisite: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open the local URL shown in your terminal.

## Build

```bash
npm run lint
npm run build
```

## Deploy to GitHub Pages

This repo includes a GitHub Pages workflow at `.github/workflows/deploy.yml`.

After pushing to GitHub:

1. Open the repository on GitHub.
2. Go to `Settings` -> `Pages`.
3. Set `Build and deployment` -> `Source` to `GitHub Actions`.
4. Push to `main`; the workflow will build and publish the app.

## Privacy

Words, settings, and progress are stored in the user's browser via IndexedDB. API keys entered in Settings are also stored locally in the browser. Do not enter an API key on a shared or untrusted device.

## License

Apache-2.0
