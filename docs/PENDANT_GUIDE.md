# MindMirror Pendant: build guide

Oct 24, 2026 · Live doc: https://claude.ai/artifact/H1xzVoez9QF8iQfqTNWBgg

## My opinion: keep the pendant dumb and the phone smart

Build the pendant as a **push-to-talk Bluetooth microphone with a light and a buzzer**, about **₹950** in parts. Put all the intelligence (Whisper speech-to-text, the companion, the six early signals) in the MindMirror app the student already has. That one decision makes it cheap, private and buildable in a hackathon.

- **No AI on the pendant.** An ESP32-S3 cannot run a useful language model, and a Raspberry Pi Zero 2 W or a dedicated AI chip triples the cost and kills the battery. The phone is already a better computer.
- **Push-to-talk, never always-listening.** Students wear it in classrooms, hostels and with friends. Recording only while the button is held is the only design you can defend to judges, parents and a college ethics board. It also gives 2 to 3 days of battery instead of hours.
- **No speaker in version 1.** Replies are spoken by the phone (or earphones) and the pendant answers with a soft double-tap of haptics and a colour. A speaker plus amplifier adds about ₹250, more size and a privacy problem (others hear the reply). Add it in version 2.
- **No screen, no Wi-Fi, no cloud.** Bluetooth Low Energy to the web app only. Nothing leaves the student's devices, which matches the app's promise of zero personal records online.
- **What makes it more than a gimmick:** a squeeze-and-speak check-in in 5 seconds ("I'm exhausted and behind on my lab") becomes a logged check-in, and the pendant can lead a 4-6 breathing exercise with light and gentle taps during an exam-hall wait, with no phone out.

## How it works

```
PENDANT:  hold button -> mic (16 kHz, ADPCM) -> Bluetooth LE audio frames
                                                   |
PHONE:    reply spoken + tap/LED <- companion reads signals <- Whisper (on device)
```

The pendant is only a mic, a button, a light and a buzzer. All the thinking happens on the student's own phone, so the pendant stays cheap and nothing leaves the student's devices.

## Parts list

The cheapest build costs about **₹950**; the fastest build costs about **₹1,750** but needs almost no soldering. Prices are approximate retail in India (Robu.in, Amazon.in, local electronics markets) from memory, not looked up today, so check before ordering.

**Build A: cheapest (recommended for the student version)**

| Part | Qty | Approx. ₹ | Why |
| --- | --- | --- | --- |
| ESP32-S3 SuperMini board (USB-C) | 1 | 380 | BLE 5, fast enough for audio encoding, thumb-sized |
| INMP441 I2S MEMS microphone breakout | 1 | 150 | clean digital audio, no analog noise |
| 3.7 V LiPo cell, 300–400 mAh (402535 size) | 1 | 200 | 2–3 days of normal use |
| TP4056 USB-C charger module with protection | 1 | 35 | safe charging, the SuperMini has no charger |
| Coin vibration motor, 10 mm, 3 V | 1 | 35 | the "I heard you" tap |
| S8050 NPN transistor + 1N4148 diode + 1 kΩ resistor | 1 set | 10 | drives the motor safely |
| WS2812B single LED (or 5050 breakout) | 1 | 15 | breathing colour for states |
| 6 mm tactile button + slide switch | 1 each | 10 | talk button, power off |
| 2 × 100 kΩ resistors | 2 | 2 | battery level divider |
| 3D-printed shell (college lab or local print shop) | 1 | 80 | about 38 mm round pebble |
| Cord or chain, wire, heat-shrink | 1 | 40 |  |
| **Total** |  | **≈ 957** |  |

**Build B: fastest (for the hackathon demo)**

| Part | Qty | Approx. ₹ | Why |
| --- | --- | --- | --- |
| Seeed Studio XIAO ESP32S3 Sense | 1 | 1,500 | built-in microphone and LiPo charger, so only 4 parts to wire |
| 3.7 V LiPo cell, 300 mAh | 1 | 200 |  |
| Vibration motor + transistor + diode + LED + button | 1 set | 70 | as in Build A |
| **Total** |  | **≈ 1,770** | plus shell and cord |

If you only have one day, build B. Its camera connector can be ignored; do not fit a camera, because a camera on a mental-health wearable will cost you trust with judges and users.

## Wiring

Every pin below matches the defaults in the firmware, so wire it exactly like this and nothing needs changing.

**Build A (ESP32-S3 SuperMini + INMP441)**

| From | To | Note |
| --- | --- | --- |
| INMP441 VDD | 3V3 |  |
| INMP441 GND and L/R | GND | L/R to GND selects the left channel |
| INMP441 SCK | GPIO 4 |  |
| INMP441 WS | GPIO 5 |  |
| INMP441 SD | GPIO 6 |  |
| Button leg 1 / leg 2 | GPIO 7 / GND | internal pull-up, no resistor needed |
| WS2812B DIN / VCC / GND | GPIO 8 / 3V3 / GND |  |
| GPIO 9 → 1 kΩ → S8050 base |  | emitter to GND |
| Motor + / motor − | 3V3 / S8050 collector | 1N4148 across the motor, stripe to 3V3 |
| BAT+ → 100 kΩ → GPIO 1 → 100 kΩ → GND |  | battery level, reads half the cell voltage |
| LiPo + / − | TP4056 B+ / B− |  |
| TP4056 OUT+ → slide switch → SuperMini 5V pin |  | the board's regulator makes 3.3 V |
| TP4056 OUT− | GND |  |

**Build B (XIAO ESP32S3 Sense)**

| From | To | Note |
| --- | --- | --- |
| Microphone | built in (PDM on GPIO 42 / 41) | set `MIC_XIAO_SENSE_PDM 1` |
| Button | D0 and GND |  |
| WS2812B DIN | D1 |  |
| Motor driver base resistor | D2 | same transistor circuit as Build A |
| Battery divider midpoint | D3 |  |
| LiPo | BAT+ / BAT− pads under the board | charges over USB-C |

Three rules that save a night of debugging: keep the microphone wires under 5 cm, never drive the motor straight from a GPIO pin, and check LiPo polarity twice before the first charge.

## Flashing the firmware

The firmware is already written: `firmware/mindmirror_pendant/mindmirror_pendant.ino` in the [pankqx/checking](https://github.com/pankqx/checking) repo. Flashing takes about 10 minutes the first time.

1. Install Arduino IDE 2.
2. In Boards Manager, install **esp32 by Espressif Systems**, version 3.x.
3. In Library Manager, install **NimBLE-Arduino** (version 2.x).
4. Open the sketch. At the top, set `MIC_XIAO_SENSE_PDM 1` for Build B, or `MIC_XIAO_SENSE_PDM 0` and `MIC_INMP441_I2S 1` for Build A.
5. Pick the board: **XIAO\_ESP32S3** (Build B) or **ESP32S3 Dev Module** (Build A). Set **USB CDC On Boot: Enabled**.
6. Plug in USB-C and click Upload. If the port does not appear, hold BOOT, tap RESET, release BOOT, then upload again.
7. The motor buzzes once on start-up and the LED glows faint teal while it waits for the app.

What the firmware does, in one breath: while the button is held it reads 16 kHz audio, compresses it 4:1 with IMA-ADPCM (64 kbit/s, well within Bluetooth LE) and streams 20 ms packets to the app. On release it waits for the app's reply, then double-taps the motor and fades the LED green. The app can also start a breathing exercise on the pendant (light swells for 4 s, fades for 6 s, with a tap at each change).

## Pairing with the app, and the 60-second demo

Pairing happens inside MindMirror, on the **Pendant** room (home screen, last widget). It needs Chrome or Edge on Android, Windows, macOS or ChromeOS; iPhone Safari has no Web Bluetooth.

1. Switch the pendant on. The LED breathes faint teal.
2. Open **Pendant** and tap **Pair pendant**. Chrome shows a device list; pick **MindMirror-XXXX**.
3. The pendant buzzes once and the app shows **connected** with the battery level.
4. Hold the pendant button and speak. The LED turns indigo while it listens.
5. Let go. The LED shimmers yellow while the phone transcribes on-device and the companion thinks. The reply is spoken by the phone, the pendant taps twice and glows green.

No pendant yet? The same screen has **Try with your phone mic**, which runs the exact pipeline with the phone as the microphone. Use it as the demo fallback.

**Demo script for judges (60 seconds)**

1. Show the pendant on its cord. "It costs under ₹1,000. It has no AI inside and it never listens unless you press it."
2. Press and say: "I'm exhausted and I have three deadlines tomorrow."
3. While it thinks, point at the yellow light: "Speech is turned into text on this phone. Nothing goes to a server."
4. Reenu answers aloud with the PressureMap numbers (hours due vs hours planned) and the pendant taps twice.
5. Open Home: the spoken sentence was saved as today's check-in, and the signals updated.
6. Start a 1-minute breath from the Meditation room and hold the pendant up: it glows and taps with each breath.

## Enclosure and wearing it

Make it a smooth 38 mm pebble, 14 mm thick, worn on a cord at breastbone height so the microphone sits about 20 cm from the mouth.

- **Shape:** two-part shell (front cap + back plate), snap fit or two M2 screws. Print in PLA or PETG at 0.2 mm; a matte light colour hides layer lines.
- **Front:** a 1 mm pin-hole for the microphone, a 6 mm light window filled with a thin translucent disc, and the talk button under a raised ring you can find without looking.
- **Inside, stacked:** LiPo at the back, board in the middle, motor glued flat against the back plate so taps are felt on the chest.
- **Bottom:** USB-C opening for charging, slide switch next to it.
- **Cord loop:** a solid bridge on top, 4 mm hole, for a cotton cord or a thin chain.
- **Indian design touch (optional):** emboss a small kolam or rangoli dot grid on the back plate; it reads as jewellery, not a gadget, which is what makes students actually wear it.

## Battery, privacy, safety and honest limits

**Battery.** The pendant streams only while the button is held. On a 300–400 mAh LiPo that gives about 2–3 days of normal use (a few check-ins and chats a day). Charge over USB-C overnight; the Pendant room shows the battery level.

**LiPo safety.** Use cells with a built-in protection circuit, or add a DW01 protection module. Never charge a swollen or punctured cell, and do not charge it while it is being worn.

**Privacy.** Nothing is recorded on the pendant. Audio flows only while the button is held, goes to the paired phone over BLE, is transcribed on the phone, and is then discarded. Only the text check-in is saved, in the browser's own storage. No cloud, no account, no always-on listening. The LED is lit whenever the mic is live.

**Not a medical device.** MindMirror notices patterns and points to support; it does not diagnose. Crisis wording stops the chat and shows Tele-MANAS **14416**, **112** and the campus counsellor.

**Honest limits.**

- Web Bluetooth works in Chrome and Edge on Android, Windows, macOS and ChromeOS. iPhone Safari lacks it, so iPhone students use the phone-mic simulator.
- v1 has no speaker. Replies are spoken by the phone, and the pendant answers with haptic taps and LED colour.
- Whisper tiny is English-first. Hindi and Kannada need a larger model (v2).
- BLE range is about 10 m; the phone must be nearby.

## Version 2 and cost at scale

**v2 roadmap.**

1. **Speaker:** add a MAX98357A I2S amp and a 15 mm speaker (about ₹250) so the pendant can speak replies itself.
2. **Custom PCB:** one round board with the ESP32-S3 module, mic, charger and motor driver. It shrinks the pebble to 30 mm and removes all hand wiring.
3. **Native app** (Capacitor) so iPhone students can pair over CoreBluetooth.
4. **Multilingual voice:** Whisper base or small for Hindi and Kannada.
5. **Skin temperature or HR sensor** on the back for stress cues without a watch.

**Cost at scale (per unit, estimated).**

| Quantity | Build | Approx. cost |
| --- | --- | --- |
| 1 (prototype) | Build A, SuperMini + INMP441 | ₹957 |
| 1 (prototype) | Build B, XIAO ESP32S3 Sense | ₹1,770 |
| 100 (college pilot) | Custom PCB, assembled, printed shell | ₹650–750 |
| 1,000+ | Custom PCB, injection-moulded shell | ₹450–550 |

These are estimates from LCSC, JLCPCB and Robu.in listed prices; check current prices before ordering. At ₹500 the pendant costs less than a month of most streaming plans, which keeps it within reach of students and makes a college bulk buy realistic.
