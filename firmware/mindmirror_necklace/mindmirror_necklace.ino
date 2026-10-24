/*
  MindMirror Necklace firmware v2 (Seeed Studio XIAO ESP32S3 Sense)
  -----------------------------------------------------------------
  Push-to-talk voice companion that answers through its OWN speaker.

    hold button  -> built-in PDM mic (I2S0) -> IMA ADPCM -> BLE notify -> phone
    phone        -> Whisper + companion + TTS -> ADPCM clip -> BLE write -> necklace
    necklace     -> verifies length + CRC-32 -> MAX98357A (I2S1) -> speaker

  Half duplex on purpose: the mic is off while the speaker plays, so there is
  no feedback loop. Pressing the button while it talks stops the reply and
  starts a new recording (barge-in).

  If the phone is not connected, or never answers, the necklace speaks one of
  its stored fallback phrases (clips.h) and shows an amber light, so a demo
  never ends in silence. Those phrases are never presented as AI replies.

  Protocol: docs/NECKLACE_PROTOCOL.md (mirrored in protocol.h and
  src/lib/necklace/protocol.ts).

  Arduino IDE settings
    Board: "XIAO_ESP32S3"   (esp32 by Espressif Systems, core 3.x)
    PSRAM: "OPI PSRAM"      (required: reply clips are buffered in PSRAM)
    USB CDC On Boot: "Enabled"  (Serial Monitor over USB-C at 115200)
  Library: NimBLE-Arduino 2.x (Library Manager)
*/

#include <Arduino.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include "driver/i2s_pdm.h"
#include "driver/i2s_std.h"

#include "config.h"
#include "protocol.h"
#include "adpcm.h"
#include "crc32.h"
#include "clips.h"
#include "clip.h"

#define LOG(...) Serial.printf("[necklace] " __VA_ARGS__)

// =================================================================== state
enum Mode : uint8_t { M_IDLE, M_RECORDING, M_AWAITING, M_PLAYING };
volatile Mode mode = M_IDLE;

enum Light : uint8_t { L_IDLE, L_LISTEN, L_THINK, L_SPEAK, L_FALLBACK, L_ERROR, L_CALM };
Light light = L_IDLE;
uint32_t lightSince = 0;
uint8_t calmCycles = 0;

volatile bool connected = false;
volatile uint16_t connHandle = BLE_HS_CONN_HANDLE_NONE;
volatile uint16_t mtu = 23;
uint8_t volume = DEFAULT_VOLUME;
bool hasAmp = false, hasMic = false;

NimBLEServer* server;
NimBLECharacteristic *chAudioUp, *chState;
Preferences prefs;

void setLight(Light l) { light = l; lightSince = millis(); }

// ================================================================ events
// BLE callbacks run on the NimBLE task; they queue events here and loop()
// sends them, so all notifications go out from one place.
struct Ev { uint8_t len; uint8_t b[14]; };
QueueHandle_t evq;

void emit(const uint8_t* b, uint8_t len) {
  Ev e; e.len = len; memcpy(e.b, b, len);
  xQueueSend(evq, &e, 0);
}
void emit1(uint8_t ev, uint8_t a) { uint8_t b[2] = {ev, a}; emit(b, 2); }
void emitError(uint8_t code, uint8_t detail = 0) { uint8_t b[3] = {EV_ERROR, code, detail}; emit(b, 3); LOG("error %u/%u\n", code, detail); }

void emitHello() {
  uint8_t f = (hasAmp ? FEAT_SPEAKER : 0) | FEAT_LOCAL_CLIPS | (BATTERY_SENSE ? FEAT_BATTERY : 0);
  uint8_t b[8] = {EV_HELLO, NECKLACE_PROTOCOL, (uint8_t)(mtu & 0xff), (uint8_t)(mtu >> 8), f, volume, FW_MAJOR, FW_MINOR};
  emit(b, 8);
}

void drainEvents() {
  Ev e;
  while (xQueueReceive(evq, &e, 0) == pdTRUE) {
    if (connected) chState->notify(e.b, e.len);
  }
}

// ============================================================== audio out
i2s_chan_handle_t ampCh = nullptr, micCh = nullptr;

bool ampInit() {
  i2s_chan_config_t cc = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1, I2S_ROLE_MASTER);
  cc.auto_clear = true;  // underrun -> silence, never a repeated buzz
  if (i2s_new_channel(&cc, &ampCh, nullptr) != ESP_OK) return false;
  i2s_std_config_t sc = {};
  sc.clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(AUDIO_RATE);
  sc.slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO);
  sc.gpio_cfg.mclk = I2S_GPIO_UNUSED;
  sc.gpio_cfg.bclk = (gpio_num_t)PIN_AMP_BCLK;
  sc.gpio_cfg.ws = (gpio_num_t)PIN_AMP_LRC;
  sc.gpio_cfg.dout = (gpio_num_t)PIN_AMP_DIN;
  sc.gpio_cfg.din = I2S_GPIO_UNUSED;
  if (i2s_channel_init_std_mode(ampCh, &sc) != ESP_OK) return false;
  return i2s_channel_enable(ampCh) == ESP_OK;
}

// MAX98357A mixes (L+R)/2 by default, so the same sample goes to both slots.
void ampWrite(const int16_t* mono, size_t n) {
  static int16_t st[FRAME_SAMPLES * 2];
  int32_t g = (int32_t)volume * volume * 256 / 10000;  // gentle curve, 0..256
  for (size_t i = 0; i < n; i++) {
    int32_t v = ((int32_t)mono[i] * g) >> 8;
    st[2 * i] = st[2 * i + 1] = (int16_t)adpcm_clamp(v, -32768, 32767);
  }
  size_t w;
  i2s_channel_write(ampCh, st, n * 4, &w, 200);
}

void tone(float hz, int ms, float level = 0.25f) {
  if (!hasAmp) return;
  static int16_t buf[FRAME_SAMPLES];
  int total = AUDIO_RATE * ms / 1000, done = 0;
  float ph = 0, dph = 2 * PI * hz / AUDIO_RATE;
  while (done < total) {
    int n = min(FRAME_SAMPLES, total - done);
    for (int i = 0; i < n; i++, done++) {
      float env = min(1.0f, min(done, total - done) / 160.0f);  // 10 ms fade
      buf[i] = (int16_t)(sinf(ph) * env * level * 32767);
      ph += dph;
    }
    ampWrite(buf, n);
  }
}

// =============================================================== audio in
bool micInit() {
  i2s_chan_config_t cc = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);  // PDM RX lives on I2S0
  if (i2s_new_channel(&cc, nullptr, &micCh) != ESP_OK) return false;
  i2s_pdm_rx_config_t pc = {};
  pc.clk_cfg = I2S_PDM_RX_CLK_DEFAULT_CONFIG(AUDIO_RATE);
  pc.slot_cfg = I2S_PDM_RX_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);
  pc.gpio_cfg.clk = (gpio_num_t)PIN_MIC_CLK;
  pc.gpio_cfg.din = (gpio_num_t)PIN_MIC_DATA;
  return i2s_channel_init_pdm_rx_mode(micCh, &pc) == ESP_OK;
}

// =============================================================== clip store
Clip clips[MAX_CLIPS];
portMUX_TYPE clipMux = portMUX_INITIALIZER_UNLOCKED;
uint32_t nextOrder = 1;
uint32_t waitingNextSince = 0;  // a non-final clip finished, waiting for the next one

static inline uint16_t rd16(const uint8_t* p) { return p[0] | (p[1] << 8); }
static inline uint32_t rd32(const uint8_t* p) { return p[0] | (p[1] << 8) | (p[2] << 16) | ((uint32_t)p[3] << 24); }

Clip* findClip(uint8_t id) {
  for (auto& c : clips) if (c.state != C_FREE && c.id == id) return &c;
  return nullptr;
}

void freeAllClips() {
  portENTER_CRITICAL(&clipMux);
  for (auto& c : clips) if (c.state != C_PLAYING) c.state = C_FREE;
  portEXIT_CRITICAL(&clipMux);
}

void clipBegin(const uint8_t* p, size_t n) {
  if (n < 19) return;
  uint8_t id = p[1], flags = p[2];
  uint16_t rate = rd16(p + 3);
  uint32_t samples = rd32(p + 5), bytes = rd32(p + 9), crc = rd32(p + 13);
  uint16_t chunk = rd16(p + 17);
  uint32_t nChunks = chunk ? (bytes + chunk - 1) / chunk : 0;
  if (rate != AUDIO_RATE || bytes == 0 || bytes > MAX_CLIP_BYTES || chunk == 0 || chunk > 512 ||
      nChunks > BITMAP_BYTES * 8 || samples > bytes * 2) {
    emitError(ERR_BAD_FORMAT, id);
    return;
  }
  portENTER_CRITICAL(&clipMux);
  Clip* c = findClip(id);
  if (c && c->state == C_PLAYING) c = nullptr;
  if (!c) for (auto& x : clips) if (x.state == C_FREE) { c = &x; break; }
  if (c) {
    c->state = C_RECEIVING; c->id = id; c->flags = flags; c->samples = samples; c->bytes = bytes; c->crc = crc;
    c->chunk = chunk; c->nChunks = nChunks; c->received = 0; c->order = nextOrder++; c->touched = millis();
    memset(c->bitmap, 0, (nChunks + 7) / 8);
  }
  portEXIT_CRITICAL(&clipMux);
  if (!c) { emitError(ERR_QUEUE_FULL, id); return; }
  if (mode == M_AWAITING) setLight(L_THINK);
}

void clipData(const uint8_t* p, size_t n) {
  if (n < 4) return;
  Clip* c = findClip(p[0]);
  if (!c || c->state != C_RECEIVING) return;
  uint16_t idx = rd16(p + 1);
  if (idx >= c->nChunks) return;
  uint32_t off = (uint32_t)idx * c->chunk;
  uint32_t len = min((uint32_t)c->chunk, c->bytes - off);
  if (n - 3 != len) return;  // wrong size: ignore, END will report it missing
  memcpy(c->data + off, p + 3, len);
  portENTER_CRITICAL(&clipMux);
  uint8_t bit = 1 << (idx & 7);
  if (!(c->bitmap[idx >> 3] & bit)) { c->bitmap[idx >> 3] |= bit; c->received++; }
  c->touched = millis();
  portEXIT_CRITICAL(&clipMux);
}

void clipEnd(uint8_t id) {
  Clip* c = findClip(id);
  if (!c || c->state != C_RECEIVING) { uint8_t b[5] = {EV_CLIP_BAD, id, 0, 0, BAD_UNKNOWN}; emit(b, 5); return; }
  c->touched = millis();
  if (c->received < c->nChunks) {
    uint16_t miss = 0;
    while (miss < c->nChunks && (c->bitmap[miss >> 3] & (1 << (miss & 7)))) miss++;
    uint8_t b[5] = {EV_CLIP_BAD, id, (uint8_t)(miss & 0xff), (uint8_t)(miss >> 8), BAD_MISSING};
    emit(b, 5);
    LOG("clip %u missing from chunk %u (%u/%u)\n", id, miss, c->received, c->nChunks);
    return;
  }
  if (crc32(c->data, c->bytes) != c->crc) {
    portENTER_CRITICAL(&clipMux);
    c->received = 0; memset(c->bitmap, 0, (c->nChunks + 7) / 8);
    portEXIT_CRITICAL(&clipMux);
    uint8_t b[5] = {EV_CLIP_BAD, id, 0, 0, BAD_CRC};
    emit(b, 5);
    LOG("clip %u CRC mismatch\n", id);
    return;
  }
  portENTER_CRITICAL(&clipMux);
  c->state = C_READY;
  portEXIT_CRITICAL(&clipMux);
  emit1(EV_CLIP_OK, id);
  LOG("clip %u ok: %u bytes, %.1f s\n", id, c->bytes, c->samples / (float)AUDIO_RATE);
}

// Next clip in arrival order, only if it is complete.
Clip* nextReadyClip() {
  Clip* best = nullptr;
  for (auto& c : clips)
    if ((c.state == C_RECEIVING || c.state == C_READY) && (!best || c.order < best->order)) best = &c;
  return (best && best->state == C_READY) ? best : nullptr;
}

// =================================================================== button
bool buttonDown() {
  static bool stable = false, last = false;
  static uint32_t changed = 0;
  bool raw = digitalRead(PIN_BUTTON) == LOW;
  if (raw != last) { last = raw; changed = millis(); }
  if (millis() - changed > 25) stable = raw;
  return stable;
}

// =================================================================== LED
void led(float r, float g, float b) {
  rgbLedWrite(PIN_LED, r * LED_BRIGHTNESS * 255, g * LED_BRIGHTNESS * 255, b * LED_BRIGHTNESS * 255);
}

void renderLed() {
  static uint32_t lastDraw = 0;
  if (millis() - lastDraw < 20) return;
  lastDraw = millis();
  uint32_t t = millis() - lightSince;
  float s;
  switch (light) {
    case L_IDLE:
      if (connected) led(0, 0.06f, 0.05f);                                     // faint teal
      else { s = 0.03f + 0.03f * sinf(millis() / 700.0f); led(s, s * 0.6f, s * 0.2f); }  // slow warm pulse
      break;
    case L_LISTEN: s = 0.45f + 0.25f * sinf(t / 160.0f); led(0.18f * s, 0.23f * s, 0.86f * s); break;  // indigo
    case L_THINK:  s = 0.5f + 0.5f * sinf(t / 90.0f); led(0.89f * s * 0.5f, 0.66f * s * 0.5f, 0.2f * s * 0.5f); break;  // haldi
    case L_SPEAK:  s = 0.35f + 0.25f * sinf(t / 220.0f); led(0.54f * s, 0.65f * s, 0.5f * s); break;  // pista
    case L_FALLBACK: led(0.6f, 0.28f, 0); break;                                // amber: stored phrase, not AI
    case L_ERROR:  led((t / 120) % 2 ? 0.8f : 0, 0, 0); if (t > 1200) setLight(L_IDLE); break;
    case L_CALM: {
      uint32_t c = t % 10000;
      s = c < 4000 ? c / 4000.0f : 1.0f - (c - 4000) / 6000.0f;
      led(0.82f * s * 0.4f, 0.33f * s * 0.4f, 0.23f * s * 0.4f);
      if (t > (uint32_t)calmCycles * 10000) setLight(L_IDLE);
      break;
    }
  }
}

// =================================================================== BLE
class ServerCB : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* s, NimBLEConnInfo& info) override {
    connected = true;
    connHandle = info.getConnHandle();
    mtu = s->getPeerMTU(connHandle);
    s->updateConnParams(connHandle, 6, 12, 0, 400);  // 7.5-15 ms interval, 4 s supervision
    s->setDataLen(connHandle, 251);
    s->updatePhy(connHandle, BLE_GAP_LE_PHY_2M_MASK, BLE_GAP_LE_PHY_2M_MASK, 0);
    ble_gattc_exchange_mtu(connHandle, nullptr, nullptr);  // ask the phone for a big MTU ourselves
    LOG("connected\n");
  }
  void onDisconnect(NimBLEServer*, NimBLEConnInfo&, int reason) override {
    connected = false;
    connHandle = BLE_HS_CONN_HANDLE_NONE;
    mtu = 23;
    portENTER_CRITICAL(&clipMux);
    for (auto& c : clips) if (c.state == C_RECEIVING) c.state = C_FREE;  // never keep half a clip
    portEXIT_CRITICAL(&clipMux);
    LOG("disconnected (%d)\n", reason);
    NimBLEDevice::startAdvertising();
  }
  void onMTUChange(uint16_t m, NimBLEConnInfo&) override {
    mtu = m;
    LOG("mtu %u\n", m);
    emitHello();
  }
};

uint32_t lastPhoneSign = 0;  // last THINKING keep-alive or clip activity

class CtrlCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* ch, NimBLEConnInfo&) override {
    NimBLEAttValue v = ch->getValue();
    const uint8_t* p = v.data();
    size_t n = v.size();
    if (!n) return;
    lastPhoneSign = millis();
    switch (p[0]) {
      case OP_HELLO: emitHello(); break;
      case OP_THINKING: if (mode == M_AWAITING || mode == M_IDLE) setLight(L_THINK); break;
      case OP_IDLE: if (mode == M_AWAITING) mode = M_IDLE; setLight(L_IDLE); break;
      case OP_CALM: calmCycles = n > 1 ? p[1] : 4; setLight(L_CALM); break;
      case OP_VOLUME: if (n > 1) { volume = min<uint8_t>(p[1], 100); prefs.putUChar("vol", volume); } break;
      case OP_PLAY_LOCAL: if (n > 1) pendingLocal = p[1]; break;
      case OP_STOP: stopRequested = true; break;
      case OP_ERROR: setLight(L_ERROR); break;
      case OP_CLIP_BEGIN: clipBegin(p, n); break;
      case OP_CLIP_END: if (n > 1) clipEnd(p[1]); break;
      case OP_CLIP_ABORT:
        if (n > 1) {
          portENTER_CRITICAL(&clipMux);
          Clip* c = findClip(p[1]);
          if (c && c->state != C_PLAYING) c->state = C_FREE;
          portEXIT_CRITICAL(&clipMux);
        }
        break;
    }
  }
 public:
  volatile int pendingLocal = -1;
  volatile bool stopRequested = false;
};
CtrlCB ctrlCB;

class DownCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* ch, NimBLEConnInfo&) override {
    NimBLEAttValue v = ch->getValue();
    clipData(v.data(), v.size());
    lastPhoneSign = millis();
  }
};

// ================================================================ playback
// Returns false if interrupted by a button press.
bool playAdpcm(const uint8_t* data, uint32_t bytes, uint32_t samples) {
  AdpcmState st;
  static int16_t pcm[FRAME_SAMPLES];
  uint32_t played = 0;
  for (uint32_t off = 0; off < bytes && played < samples; off += FRAME_SAMPLES / 2) {
    uint32_t nb = min((uint32_t)FRAME_SAMPLES / 2, bytes - off);
    adpcm_decode(st, data + off, nb, pcm);
    uint32_t n = min(nb * 2, samples - played);
    ampWrite(pcm, n);
    played += n;
    drainEvents();
    renderLed();
    if (buttonDown() || ctrlCB.stopRequested) return false;
  }
  return true;
}

void playLocal(uint8_t which, bool fallback) {
  if (which >= LOCAL_CLIP_COUNT || !hasAmp) return;
  setLight(fallback ? L_FALLBACK : L_SPEAK);
  emit1(EV_PLAY_START, 0xF0 | which);
  bool full = playAdpcm(LOCAL_CLIPS[which].data, LOCAL_CLIPS[which].bytes, LOCAL_CLIPS[which].bytes * 2);
  uint8_t b[3] = {EV_PLAY_DONE, (uint8_t)(0xF0 | which), (uint8_t)!full}; emit(b, 3);
  setLight(L_IDLE);
}

void playClip(Clip* c) {
  portENTER_CRITICAL(&clipMux);
  c->state = C_PLAYING;
  portEXIT_CRITICAL(&clipMux);
  mode = M_PLAYING;
  setLight(L_SPEAK);
  emit1(EV_PLAY_START, c->id);
  bool full = playAdpcm(c->data, c->bytes, c->samples);
  uint8_t b[3] = {EV_PLAY_DONE, c->id, (uint8_t)!full}; emit(b, 3);
  bool last = c->flags & CLIP_FLAG_LAST;
  portENTER_CRITICAL(&clipMux);
  c->state = C_FREE;
  portEXIT_CRITICAL(&clipMux);
  if (!full) {  // barge-in or STOP: drop the rest of this reply
    freeAllClips();
    ctrlCB.stopRequested = false;
    emit1(EV_REPLY_DONE, 0);
    mode = M_IDLE; setLight(L_IDLE);
  } else if (last) {
    emit1(EV_REPLY_DONE, 1);
    mode = M_IDLE; setLight(L_IDLE);
  } else {
    mode = M_AWAITING; setLight(L_THINK);
    waitingNextSince = millis();
  }
}

// =============================================================== recording
uint8_t session = 0;

void record() {
  session++;
  uint8_t ev[2] = {EV_BUTTON_DOWN, session};
  emit(ev, 2);
  drainEvents();
  tone(880, 50, 0.15f);                  // "I'm listening" blip, before the mic opens
  mode = M_RECORDING;
  setLight(L_LISTEN);
  i2s_channel_enable(micCh);

  static int16_t pcm[FRAME_SAMPLES];
  static uint8_t pkt[3 + FRAME_SAMPLES / 2];
  AdpcmState enc;
  uint16_t seq = 0;
  uint32_t bytesSent = 0, started = millis();
  int32_t x1 = 0, y1 = 0;                // DC blocker
  int warmup = 3;                         // drop the first 60 ms after the mic starts
  uint8_t reason = 0;

  while (true) {
    size_t got = 0;
    if (i2s_channel_read(micCh, pcm, sizeof pcm, &got, 100) != ESP_OK || got < sizeof pcm) continue;
    if (warmup > 0) { warmup--; continue; }
    for (int i = 0; i < FRAME_SAMPLES; i++) {
      int32_t x = pcm[i];
      int32_t y = x - x1 + (y1 * 255 >> 8);
      x1 = x; y1 = y;
      pcm[i] = (int16_t)adpcm_clamp(y * MIC_GAIN, -32768, 32767);
    }
    adpcm_encode(enc, pcm, FRAME_SAMPLES, pkt + 3);
    // One notification per 20 ms frame when the MTU allows it, else split.
    size_t room = mtu > 6 ? min<size_t>(mtu - 6, FRAME_SAMPLES / 2) : 1;
    for (size_t off = 0; off < FRAME_SAMPLES / 2; off += room) {
      size_t len = min(room, FRAME_SAMPLES / 2 - off);
      uint8_t out[3 + FRAME_SAMPLES / 2];
      out[0] = session; out[1] = seq & 0xff; out[2] = seq >> 8;
      memcpy(out + 3, pkt + 3 + off, len);
      for (int tries = 0; tries < 5 && connected; tries++) {
        if (chAudioUp->notify(out, 3 + len)) break;
        delay(2);
      }
      seq++;
      bytesSent += len;
    }
    renderLed();
    drainEvents();
    if (!buttonDown()) break;
    if (millis() - started > MAX_RECORD_MS) { reason = 1; break; }
    if (!connected) break;
  }
  i2s_channel_disable(micCh);
  uint8_t done[9] = {EV_REC_DONE, session, (uint8_t)(seq & 0xff), (uint8_t)(seq >> 8),
                     (uint8_t)(bytesSent & 0xff), (uint8_t)(bytesSent >> 8), (uint8_t)(bytesSent >> 16), (uint8_t)(bytesSent >> 24), reason};
  emit(done, 9);
  drainEvents();
  LOG("recorded %u packets, %u bytes, %.1f s\n", seq, bytesSent, bytesSent * 2 / (float)AUDIO_RATE);
  tone(660, 40, 0.12f);                  // "sent" blip
  if (!connected) { playLocal(LOCAL_NO_PHONE, true); mode = M_IDLE; return; }
  mode = M_AWAITING;
  setLight(L_THINK);
  lastPhoneSign = millis();
  if (reason == 1) while (buttonDown()) { delay(10); renderLed(); }  // wait for release after the time limit
}

// ================================================================= battery
uint8_t batteryPct = 100;
uint16_t batteryMv = 0;
bool lowWarned = false;

void readBattery() {
#if BATTERY_SENSE
  static uint32_t last = 0;
  if (last && millis() - last < 30000) return;
  last = millis();
  batteryMv = analogReadMilliVolts(PIN_BATTERY) * 2;
  batteryPct = constrain(map(batteryMv, 3400, 4150, 0, 100), 0, 100);
  uint8_t b[4] = {EV_BATTERY, batteryPct, (uint8_t)(batteryMv & 0xff), (uint8_t)(batteryMv >> 8)};
  emit(b, 4);
  if (batteryMv < 3450 && !lowWarned) { lowWarned = true; ctrlCB.pendingLocal = LOCAL_LOW_BATTERY; emitError(ERR_LOW_BATTERY, batteryPct); }
  if (batteryMv > 3700) lowWarned = false;
#endif
}

// =================================================================== setup
void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  evq = xQueueCreate(48, sizeof(Ev));
  prefs.begin("necklace", false);
  volume = prefs.getUChar("vol", DEFAULT_VOLUME);
  led(0, 0, 0);

  bool psram = psramFound();
  for (auto& c : clips) {
    c.data = psram ? (uint8_t*)ps_malloc(MAX_CLIP_BYTES) : nullptr;
    c.bitmap = (uint8_t*)malloc(BITMAP_BYTES);
  }
  if (!psram || !clips[MAX_CLIPS - 1].data) {
    // Without PSRAM there is nowhere to hold a reply. Tell the builder loudly.
    while (true) { LOG("PSRAM missing: Tools > PSRAM > OPI PSRAM, then upload again\n"); led(1, 0, 0); delay(300); led(0, 0, 0); delay(700); }
  }

  hasAmp = ampInit();
  hasMic = micInit();
  LOG("amp %s, mic %s, volume %u, PSRAM %u KB free\n", hasAmp ? "ok" : "FAILED", hasMic ? "ok" : "FAILED", volume, ESP.getFreePsram() / 1024);

  char name[20];
  snprintf(name, sizeof name, "MindMirror-%04X", (uint16_t)(ESP.getEfuseMac() >> 32));
  NimBLEDevice::init(name);
  NimBLEDevice::setMTU(517);
  NimBLEDevice::setPower(6);
  server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCB());
  NimBLEService* svc = server->createService(SVC_UUID);
  chAudioUp = svc->createCharacteristic(AUDIO_UP_UUID, NIMBLE_PROPERTY::NOTIFY);
  svc->createCharacteristic(CTRL_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR)->setCallbacks(&ctrlCB);
  chState = svc->createCharacteristic(STATE_UUID, NIMBLE_PROPERTY::NOTIFY | NIMBLE_PROPERTY::READ);
  svc->createCharacteristic(AUDIO_DOWN_UUID, NIMBLE_PROPERTY::WRITE_NR | NIMBLE_PROPERTY::WRITE, 512)->setCallbacks(new DownCB());
  server->start();
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(SVC_UUID);
  adv->setName(name);
  adv->enableScanResponse(true);
  adv->start();
  LOG("advertising as %s\n", name);

  if (!hasMic || !hasAmp) { setLight(L_ERROR); for (int i = 0; i < 6; i++) { led(1, 0, 0); delay(150); led(0, 0, 0); delay(150); } }
  // Two-note start chime = the speaker works.
  tone(523, 90, 0.18f);
  tone(784, 140, 0.18f);
  setLight(L_IDLE);
}

// ==================================================================== loop
void loop() {
  drainEvents();
  renderLed();
  readBattery();

  // Barge-in / new recording
  if (buttonDown() && mode != M_RECORDING) {
    if (!connected) {
      playLocal(LOCAL_NO_PHONE, true);
      while (buttonDown()) { delay(10); renderLed(); }
      return;
    }
    if (hasMic) { freeAllClips(); record(); }
    return;
  }

  // Stored phrase requested by the app (test button, or the app's own fallback)
  if (ctrlCB.pendingLocal >= 0) {
    int which = ctrlCB.pendingLocal;
    ctrlCB.pendingLocal = -1;
    playLocal(which, which != LOCAL_TEST && which != LOCAL_HELLO);
    if (mode == M_AWAITING) mode = M_IDLE;
    return;
  }
  if (ctrlCB.stopRequested) { ctrlCB.stopRequested = false; freeAllClips(); }

  // Reply clips, in order, only once each one is complete and verified
  if (Clip* c = nextReadyClip()) { playClip(c); return; }

  uint32_t now = millis();
  // Half-received clips that stalled
  portENTER_CRITICAL(&clipMux);
  for (auto& c : clips) if (c.state == C_RECEIVING && now - c.touched > CLIP_TRANSFER_TIMEOUT) { c.state = C_FREE; }
  portEXIT_CRITICAL(&clipMux);

  if (mode == M_AWAITING) {
    if (waitingNextSince && now - waitingNextSince > NEXT_CLIP_TIMEOUT && now - lastPhoneSign > NEXT_CLIP_TIMEOUT) {
      waitingNextSince = 0;
      emitError(ERR_CLIP_TIMEOUT, 0);
      emit1(EV_REPLY_DONE, 0);
      mode = M_IDLE; setLight(L_IDLE);
    } else if (!waitingNextSince && now - lastPhoneSign > PHONE_SILENT_TIMEOUT) {
      emitError(ERR_PHONE_SILENT, 0);
      playLocal(LOCAL_NO_PHONE, true);
      mode = M_IDLE;
    }
  } else {
    waitingNextSince = 0;
  }
  delay(5);
}
