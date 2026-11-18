# Episode 3: Ollama Tutorial: Run AI Free and Private on Your Laptop

- **Title:** Ollama Tutorial: Run AI Free and Private on Your Laptop (vidIQ title score: 83). Consider adding "(2026)" at the end.
- **Target keywords:** ollama tutorial (about 116K searches a month, competition 46/100), how to use ollama (about 45K, competition 46), local llm (about 69K, competition 48)
- **Format:** step-by-step tutorial, 9–12 minutes, mostly screen capture
- **Thumbnail draft:** `thumbnails/ep03-ollama.png` (vidIQ score: 22, low). Regenerate it or redesign by hand. See the notes at the end of this file.
- **Before recording:** check these steps against the official docs at ollama.com. The install steps below come from third-party guides dated 2026 (sources at the end), not from Ollama's own documentation. Model names change often, so pick your demo model on recording day. Fill in `[NEEDS INFO: ...]` with your actual laptop specs and results.

## Script

### Cold open (0:00–0:30)

[SCREEN: Wi-Fi turned off, then a chat reply appearing]

My Wi-Fi is off. This AI is still answering, because it runs entirely on this laptop. Nothing I type here goes to anyone's server, and there's no subscription.

It's called Ollama, it's free, and in the next ten minutes I'll install it, download a model, and show you where it's good enough for real work and where it isn't.

### Why run AI locally? (0:30–1:30)

[ON CAMERA]

Three reasons, especially if you run a small business.

Privacy. Client details, quotes and contracts stay on your machine.

Cost. The software is free, and the open models you run with it don't charge per message.

Offline. It works on a job site with no signal, or on a plane.

The trade-off: a model running on a laptop is usually smaller than the big cloud models, so expect it to be slower and less capable on hard tasks. I'll show you exactly where that bites.

### What you need (1:30–2:30)

[SCREEN: your system info]

I'm on [NEEDS INFO: laptop model, chip, RAM, operating system].

Memory is what matters most. Each model has a download size listed on the Ollama site, and you need enough free RAM to hold it. Smaller models, in the range of a few billion parameters, are the realistic starting point for an ordinary laptop. Apple Silicon Macs use their GPU automatically. On Windows and Linux, a supported graphics card speeds things up but isn't required.

Check the model's size before downloading, and start small.

### Step 1: install (2:30–4:00)

[SCREEN: ollama.com/download]

Go to ollama.com/download and pick your system.

On Windows, run the installer. It adds an Ollama icon to your system tray. If you prefer the terminal, you can also install it with winget:

```
winget install Ollama.Ollama
```

On a Mac, download the app and drag it to Applications, or use Homebrew:

```
brew install ollama
```

On Linux, the site gives you a one-line install script. Read it before you run it:

```
curl -fsSL https://ollama.com/install.sh | sh
```

[SCREEN: terminal]

To check it worked, open a terminal and type:

```
ollama --version
```

If Windows says the command isn't found, restart your computer so it picks up the new path, then try again.

### Step 2: pick a model (4:00–5:15)

[SCREEN: Ollama model library on ollama.com]

The Ollama website has a library of models. Each page shows the sizes available and, importantly, the licence.

For a first try, pick a small general-purpose chat model. I'm using [NEEDS INFO: model name and size tag] because [NEEDS INFO: reason, e.g. it fits in my RAM and is licensed for commercial use].

If you'll use it for business work, read the model's licence. Open models come with different terms, and some limit commercial use.

### Step 3: run it (5:15–6:30)

[SCREEN: terminal]

One command downloads the model and starts a chat:

```
ollama run [MODEL NAME]
```

The first time, it downloads the model, which can take a while depending on its size. After that, it starts in seconds.

Type a message and press Enter. To leave the chat, type `/bye`.

Two other commands worth knowing: `ollama pull [MODEL NAME]` downloads a model without starting it, and `ollama list` shows what you've downloaded.

[If your version of the Ollama desktop app has a chat window, show it here as the no-terminal option. Check this on recording day.]

### Step 4: real work test (6:30–9:00)

[SCREEN: three tasks, run live]

Benchmarks don't tell you much about your own work, so here are three tasks a sole trader actually does.

Task one: rewrite a rough client email so it sounds professional.
[NEEDS INFO: result and time taken]

Task two: summarise a long document you've pasted in, such as terms and conditions.
[NEEDS INFO: result, and whether it missed anything important]

Task three: draft a quote from bullet points.
[NEEDS INFO: result, and any errors in numbers or details]

So on my laptop, it was [NEEDS INFO: honest verdict, e.g. good for rewriting and summaries, weaker at …]. Speed was [NEEDS INFO: describe what you saw, e.g. a few seconds before text started].

### Local or cloud: which should you use? (9:00–10:00)

[ON CAMERA]

Use local AI when privacy matters, when you're offline, or when you're doing lots of small rewriting and summarising.

Use a cloud model when the task is hard, like complex reasoning or long documents, or when speed matters more than privacy.

Plenty of people use both: local for anything with client details, and cloud for the heavy lifting.

### Close (10:00–10:30)

[SCREEN: Wi-Fi off again]

The Wi-Fi is still off. That email draft, the summary and the quote never left this laptop.

Commands and links are in the description. Next, I'm testing [NEEDS INFO: next episode, e.g. LM Studio, a no-terminal way to do the same thing].

## Description draft

```
How to install Ollama and run a free, private AI model on your own laptop, plus a real test on small-business tasks.

My setup: [NEEDS INFO: laptop, chip, RAM, OS]. Model used: [NEEDS INFO: model and size]. Ollama version: [NEEDS INFO]. Recorded [NEEDS INFO: date]; steps and models change, so check ollama.com for the latest.

Commands
Windows (optional): winget install Ollama.Ollama
Mac (optional): brew install ollama
Linux: curl -fsSL https://ollama.com/install.sh | sh
Check install: ollama --version
Run a model: ollama run MODEL_NAME
Download only: ollama pull MODEL_NAME
List models: ollama list
Exit chat: /bye

Links
Ollama: https://ollama.com
Check each model's licence on its page before using it for business work.

Chapters
0:00 Offline demo
0:30 Why local AI
1:30 What you need
2:30 Install
4:00 Pick a model
5:15 Run it
6:30 Real work test
9:00 Local vs cloud
10:00 Wrap-up

Not sponsored. Practical AI for people who run a business on their own.
```

**Tags:** ollama tutorial, how to use ollama, ollama, local llm, local ai, run ai locally, private ai, offline ai, free ai, ai for small business, local ai for beginners

## Thumbnail notes

- vidIQ scored the draft 22/100. It said the image lacks clean structure and feels low-energy.
- Fix: use your face showing surprise, with a laptop showing a chat window and a crossed-out Wi-Fi icon. Use two words at most, for example "NO WI-FI?". Keep a cleaner grid and stronger saturation.
- Use a neutral llama silhouette, not Ollama's own logo, unless you check their brand guidelines first.

## Sources checked (third-party, 2026)

- [Tom's Guide: How to install Ollama on your laptop](https://tomsguide.com/how-to-install-ollama-on-your-computer)
- [LMSA: How to install and configure Ollama on Windows and Mac (2026)](https://lmsa.app/blog/how-to-install-and-configure-ollama-on-windows-and-mac-complete-2026-guide/)
- [Evetech: How to install Ollama on Windows and Mac](https://evezone.evetech.co.za/build-lab/how-to-install-ollama-on-windows-and-mac)
- [KodeKloud: Installing Ollama](https://notes.kodekloud.com/docs/Running-Local-LLMs-With-Ollama/Getting-Started-With-Ollama/Installing-Ollama)
