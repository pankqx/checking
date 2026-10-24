# MindMirror

**Team HTTP Dino · St Aloysius (Deemed to be University) · Problem 2 "Mind Check" (Mental Wellness Tech)**

A private well-being companion for students. MindMirror helps a student **notice early signs** of stress and burnout, **understand their own patterns** and **find the right support** before things get overwhelming, without ever diagnosing them. Everything runs in the browser: no account, no server, no analytics.

## What it does

| Problem statement says | MindMirror watches | How (code, not AI) |
|---|---|---|
| academic pressure | **Pressure** | PressureMap: hours of work due in 3 days vs hours planned, plus stress check-ins |
| poor sleep | **Sleep** | last 3 nights vs your usual (from check-ins or watch) |
| isolation | **Connection** | "talked to someone you like?" last 4 days vs prior 14 |
| exhaustion | **Energy** | energy check-ins + resting heart rate vs your baseline |
| loss of motivation | **Drive** | habit completion last 5 days vs prior 12, overdue tasks |
| changes in everyday behaviour | **Rhythm** | steps vs baseline, check-ins drifting later into the night |

The six signals combine into **mind weather** (Clear skies → Heavy skies), which picks a rung on the **support ladder**: look after yourself → reach out to a friend → talk to a counsellor → Tele-MANAS 14416 / 112. Crisis wording anywhere routes straight to human help. Every insight shows its proof, and every number is unit tested (`src/lib/analysis.test.ts`).

## Features

- **Two worlds**: *Minimal* (paper, ink and Indian pigments) and *Grandeur* (night garden: aurora, fireflies, glass, iris page reveals, 3D coverflow). Switch from the home header.
- **Talking companions, Reenu and Roman**: the ink characters from [pank-os](https://github.com/pankqx/pank-os), now with lip-sync to their voice (speech word boundaries), waving, blinking, gaze, and happy / concerned / calm / surprised faces. Karaoke captions for every line.
- **Soft onboarding**: one gentle question at a time, each one skippable, asked out loud by the companion.
- **30-second check-in** by tap or voice (on-device Whisper).
- **Rooms** as swipeable widgets: Insights, Thoughts (guided + gratitude journal), Meditation room (Box / 4-7-8 / Calm breathing, tanpura, rain and ocean generated with Web Audio, guided by the companion), Pressure release room (bubble wrap, worry shredder, shout jar, angry scribble), Body, Necklace.
- **Planner + habits** with PressureMap and a one-tap "move +1 day".
- **Smartwatch**: live heart rate and HRV over Web Bluetooth (any band that broadcasts standard heart rate), or CSV import.
- **Companion chat**: instant rule-based replies offline; optional on-device Qwen 2.5 1.5B via WebLLM that only explains computed facts.
- **MindMirror Necklace**: a push-to-talk necklace (Seeed XIAO ESP32S3 Sense + MAX98357A amp + small speaker) that **answers out loud through its own speaker**. The phone transcribes with on-device Whisper, writes the reply, turns it into speech on the phone, and sends it to the necklace as checked audio clips (IMA-ADPCM, CRC-32, resend on loss). Six recorded fallback lines live in the necklace for when the phone is unreachable. A phone-mic simulator works without hardware. Build guide: [`docs/NECKLACE_GUIDE.md`](docs/NECKLACE_GUIDE.md). Bluetooth protocol: [`docs/NECKLACE_PROTOCOL.md`](docs/NECKLACE_PROTOCOL.md).
- **Installable app (PWA)** with an offline shell. Export or delete all data in one tap.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 31 tests
npm run build    # static site in dist/
```

Choose **Explore with sample data** at the end of onboarding to see three weeks of a student whose sleep drifts while deadlines pile up.

Bluetooth (watch, necklace) needs Chrome or Edge on Android, Windows, macOS or ChromeOS. iPhone users can import watch data as CSV.

## Deploy

Pushes to `main` build and deploy to GitHub Pages (`.github/workflows/pages.yml`). If the first run fails at "configure-pages", turn Pages on once: repo **Settings → Pages → Source: GitHub Actions**.

## Structure

```
src/lib/analysis.ts      six signals, baseline, PressureMap, weather, insights (pure, tested)
src/lib/db.ts            IndexedDB via Dexie (all data stays on the device)
src/lib/buddy.ts         companion state, voice, lip-sync, Minimal/Grandeur
src/character/           Reenu + Roman ink characters (from pank-os)
src/lib/ble.ts           heart-rate + necklace GATT link
src/lib/adpcm.ts         IMA-ADPCM codec, CRC-32, resampler (matches the firmware)
src/lib/necklace/        protocol, verified clip transfer, on-phone reply voice
src/lib/companion.ts     rule replies, crisis routing, optional WebLLM
src/screens/             Onboarding, Home, CheckIn, Insights, Thoughts, Meditation, Release, Body, Companion, Planner, Pendant (necklace), You
firmware/mindmirror_necklace/  necklace firmware (Arduino, XIAO ESP32S3 Sense)
firmware/tools/          make_clips.py, regenerates the stored fallback lines
docs/                    necklace build guide and Bluetooth protocol
```

Safe by design: MindMirror is not a medical device and does not diagnose. If you are struggling, call Tele-MANAS **14416** (free, 24×7) or **112**.
