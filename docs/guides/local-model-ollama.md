# Run a local model: Ollama on your own computer

This guide lets Qbit Nutrition analyze meal photos with a model that runs on **your computer**, so nothing is sent to a
company and nothing is billed. The phone talks to your computer over your home network.
[Versión en español](local-model-ollama.es.md).

> **Verified on 2026-11-21** against Ollama's own pages, linked in each step. Ollama changes its models, commands and
> defaults: if something differs from what you see, trust Ollama's page and
> [open an issue](https://github.com/qbitdevz/qbit-nutrition/issues). **Not yet tried by the maintainers on a real
> phone**, and the accuracy of local models has not been measured: expect slower and less exact answers than a hosted
> model, and check every number it gives you.

## Before you start

- A computer (Windows, macOS or Linux) that stays on while you scan, with free disk space for the model. The `gemma4` models
  on [Ollama's library page](https://ollama.com/library/gemma4) are listed at **4.6 to 7.5 GB** (`gemma4:e2b`), **6.6 to 9.5 GB**
  (`gemma4:e4b`) and about **7.7 to 8 GB** (`gemma4:12b`), all marked as reading text and images. Pick the smallest first.
- The phone and the computer on the **same Wi-Fi network**.
- Anything on that network will be able to use your model while you follow step 3. Do not expose it to the internet. Qbit
  Nutrition itself refuses plain `http://` to any address that is not on a local or private network.

## 1. Install Ollama

Download it from [ollama.com/download](https://ollama.com/download) for your system. On macOS and Linux the page also shows
a one-line command (`curl -fsSL https://ollama.com/install.sh | sh`); on Windows there is an installer.

## 2. Download a model that can see images

In a terminal (PowerShell on Windows):

```bash
ollama pull gemma4:e2b
```

The download is large and happens once. `ollama run gemma4:e2b` opens a chat, which is a quick way to check it works; type
`/bye` to leave it. Ollama's [OpenAI-compatible API](https://docs.ollama.com/openai) serves it at
`/v1/chat/completions`, with images sent as base64 data URLs, which is how the app sends the photo. The API key is "required
but ignored": the app needs none for Ollama.

## 3. Let the phone reach your computer

Ollama listens only on the computer itself (`127.0.0.1:11434`) unless you change it with the `OLLAMA_HOST` variable
([Ollama FAQ: "How can I expose Ollama on my network?"](https://docs.ollama.com/faq)). Set it to `0.0.0.0:11434`:

- **Windows:** quit Ollama from the taskbar, open the Start menu and search for "environment variables", edit the environment
  variables for your account, add `OLLAMA_HOST` with the value `0.0.0.0:11434`, save, and start Ollama again.
- **macOS:** `launchctl setenv OLLAMA_HOST "0.0.0.0:11434"`, then restart Ollama.
- **Linux (systemd):** `sudo systemctl edit ollama.service`, add `Environment="OLLAMA_HOST=0.0.0.0:11434"` under `[Service]`,
  then `sudo systemctl daemon-reload` and `sudo systemctl restart ollama`.

Then find your computer's address on the local network (it looks like `192.168.1.23`): in the Wi-Fi details of your system
settings, or with `ipconfig` (Windows) or `ip addr` / `ifconfig` (Linux, macOS). If your computer's firewall asks whether to
allow Ollama on private networks, allow it; allow port 11434 on private networks only.

To check from the phone, open `http://<that address>:11434` in the phone's browser: any answer from Ollama, rather than a
timeout, means the phone can reach it.

## 4. Add it in the app

1. On **Today**, open **Settings** (the sliders icon, top right), then **AI providers**, then **Add a provider**.
2. Choose **Ollama (local server)**.
3. In **Base URL**, replace `http://localhost:11434/v1` with `http://<your computer's address>:11434/v1`. On the phone,
   `localhost` means the phone itself, not your computer.
4. Leave **API key** empty. In **Model**, type `gemma4:e2b` (or the model you downloaded).
5. Raise **Timeout** (up to 300 seconds): the first request after a pause loads the model into memory and can be slow.
6. Press **Test connection**, then **Save provider**. Before the first scan the app tells you the photo will be sent to this provider; with this setup it stays on your
   own network.

## 5. If something goes wrong

| What you see | What to do |
| --- | --- |
| The test cannot connect | Open `http://<address>:11434` in the phone's browser. If that fails, the computer is asleep, the address changed, `OLLAMA_HOST` was not applied (restart Ollama), or a firewall blocks port 11434. |
| It connects but answers very slowly | Use the smaller model, close other programs, and raise the timeout. A computer without a graphics card is slow with images. |
| "The model does not exist" | The name must match `ollama list` exactly, for example `gemma4:e2b`. |
| The home address changes | Your router may give the computer a new address; set a fixed one in your router, or update the Base URL. |
