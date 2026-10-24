/*
  MindMirror Pendant firmware (ESP32-S3)
  ---------------------------------------
  A deliberately "dumb" pendant: button + mic + LED + haptic motor.
  All intelligence (speech-to-text, the companion) runs on the student's
  phone or laptop inside the MindMirror web app. Audio is only captured
  while the button is held (push-to-talk), so the pendant never listens
  in the background.

  BLE protocol (must match src/lib/ble.ts):
    Service  6e400001-b5a3-f393-e0a9-e50e24dc4d4d
    Audio    6e400002-...  NOTIFY  [seq u16 LE][IMA-ADPCM 4-bit, 16 kHz mono]
    Control  6e400003-...  WRITE   [cmd][payload]
                                   0x01 listening  0x02 thinking
                                   0x03 reply + UTF-8 text  0x04 idle
                                   0x05 calm + cycles (breathing light + haptics)
    State    6e400004-...  NOTIFY  [0x10][1=pressed,0=released] | [0x20][battery %]

  Board: "XIAO_ESP32S3" or "ESP32S3 Dev Module" (Arduino-ESP32 core 3.x)
  Library: NimBLE-Arduino 2.x (Library Manager)
  Build: USB CDC On Boot = Enabled, PSRAM = OPI (XIAO Sense) or Disabled.
*/

#include <Arduino.h>
#include <NimBLEDevice.h>
#include <ESP_I2S.h>

// ---------------------------------------------------------------- hardware
// Pick ONE microphone option.
#define MIC_XIAO_SENSE_PDM   1   // Seeed XIAO ESP32S3 Sense: built-in PDM mic
#define MIC_INMP441_I2S      0   // ESP32-S3 SuperMini + INMP441 breakout

#if MIC_XIAO_SENSE_PDM
  const int PIN_PDM_CLK = 42, PIN_PDM_DATA = 41;
  const int PIN_BUTTON = 1;   // D0  -> button -> GND
  const int PIN_LED    = 2;   // D1  -> WS2812B DIN
  const int PIN_MOTOR  = 3;   // D2  -> 1k -> NPN base (motor on collector)
  const int PIN_BATT   = 4;   // D3  <- 100k/100k divider from BAT+
#else
  const int PIN_I2S_SCK = 4, PIN_I2S_WS = 5, PIN_I2S_SD = 6;  // INMP441 L/R -> GND
  const int PIN_BUTTON = 7;
  const int PIN_LED    = 8;   // SuperMini has an on-board WS2812 on GPIO48 on some revisions
  const int PIN_MOTOR  = 9;
  const int PIN_BATT   = 1;
#endif

const uint32_t SAMPLE_RATE = 16000;
const size_t   FRAME_SAMPLES = 320;              // 20 ms per BLE packet
const size_t   ADPCM_BYTES = FRAME_SAMPLES / 2;  // 160 bytes + 2 header = 162 (< MTU 247)

static const char* SVC_UUID   = "6e400001-b5a3-f393-e0a9-e50e24dc4d4d";
static const char* AUDIO_UUID = "6e400002-b5a3-f393-e0a9-e50e24dc4d4d";
static const char* CTRL_UUID  = "6e400003-b5a3-f393-e0a9-e50e24dc4d4d";
static const char* STATE_UUID = "6e400004-b5a3-f393-e0a9-e50e24dc4d4d";

I2SClass i2s;
NimBLECharacteristic *chAudio, *chState;
volatile bool connected = false;

// --------------------------------------------------------------- IMA ADPCM
static const int16_t STEP[89] = {7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,15289,16818,18500,20350,22385,24623,27086,29794,32767};
static const int8_t IDX[8] = {-1,-1,-1,-1,2,4,6,8};
struct Adpcm { int pred = 0; int index = 0; } enc;

uint8_t adpcmNibble(int16_t sample) {
  int step = STEP[enc.index];
  int diff = sample - enc.pred;
  uint8_t nib = 0;
  if (diff < 0) { nib = 8; diff = -diff; }
  int vp = step >> 3;
  if (diff >= step) { nib |= 4; diff -= step; vp += step; }
  step >>= 1; if (diff >= step) { nib |= 2; diff -= step; vp += step; }
  step >>= 1; if (diff >= step) { nib |= 1; vp += step; }
  enc.pred += (nib & 8) ? -vp : vp;
  enc.pred = constrain(enc.pred, -32768, 32767);
  enc.index = constrain(enc.index + IDX[nib & 7], 0, 88);
  return nib;
}

// ------------------------------------------------------------- LED + motor
enum Mood { IDLE, LISTENING, THINKING, REPLY, CALM, OFF } mood = IDLE;
uint32_t moodSince = 0;
int calmCycles = 0;

void led(uint8_t r, uint8_t g, uint8_t b) { rgbLedWrite(PIN_LED, r, g, b); }
void buzz(int ms, int power = 200) { analogWrite(PIN_MOTOR, power); delay(ms); analogWrite(PIN_MOTOR, 0); }

void setMood(Mood m) { mood = m; moodSince = millis(); }

void renderLed() {
  uint32_t t = millis() - moodSince;
  float s;
  switch (mood) {
    case IDLE:      s = connected ? 0.04f : 0.02f * (1 + sinf(t / 900.0f)); led(0, s * 255, s * 180); break;      // faint teal
    case LISTENING: s = 0.35f + 0.3f * sinf(t / 180.0f); led(46 * s, 58 * s, 220 * s); break;                     // indigo breathe
    case THINKING:  s = 0.5f + 0.5f * sinf(t / 90.0f); led(227 * s * 0.6f, 169 * s * 0.6f, 53 * s * 0.6f); break; // haldi shimmer
    case REPLY:     s = max(0.0f, 1.0f - t / 2500.0f); led(138 * s * 0.5f, 165 * s * 0.5f, 127 * s * 0.5f);         // pista fade
                    if (s == 0) setMood(IDLE); break;
    case CALM: {    // 4 s in, 6 s out
      uint32_t c = t % 10000;
      s = c < 4000 ? c / 4000.0f : 1.0f - (c - 4000) / 6000.0f;
      led(210 * s * 0.4f, 85 * s * 0.4f, 58 * s * 0.4f);
      static uint32_t lastPhase = 99;
      uint32_t phase = (c < 4000) ? 0 : 1;
      if (phase != lastPhase) { buzz(phase == 0 ? 40 : 15, 140); lastPhase = phase; }
      if (t > (uint32_t)calmCycles * 10000) setMood(IDLE);
      break;
    }
    case OFF: led(0, 0, 0); break;
  }
}

// --------------------------------------------------------------------- BLE
class ServerCB : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* s, NimBLEConnInfo& info) override {
    connected = true;
    s->updateConnParams(info.getConnHandle(), 6, 12, 0, 200);  // 7.5–15 ms interval for audio
    buzz(30); setMood(IDLE);
  }
  void onDisconnect(NimBLEServer*, NimBLEConnInfo&, int) override {
    connected = false;
    NimBLEDevice::startAdvertising();
  }
};

class ControlCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    std::string v = c->getValue();
    if (v.empty()) return;
    switch ((uint8_t)v[0]) {
      case 0x01: setMood(LISTENING); break;
      case 0x02: setMood(THINKING); break;
      case 0x03: setMood(REPLY); buzz(35); delay(80); buzz(35); break;   // "I answered" double tap
      case 0x04: setMood(IDLE); break;
      case 0x05: calmCycles = v.size() > 1 ? (uint8_t)v[1] : 4; setMood(CALM); break;
    }
  }
};

void notifyState(uint8_t kind, uint8_t value) {
  if (!connected) return;
  uint8_t pkt[2] = {kind, value};
  chState->setValue(pkt, 2);
  chState->notify();
}

uint8_t batteryPercent() {
  // 100k/100k divider: pin sees half the cell voltage. 3.3 V empty, 4.15 V full.
  uint32_t mv = analogReadMilliVolts(PIN_BATT) * 2;
  return (uint8_t)constrain(map(mv, 3300, 4150, 0, 100), 0, 100);
}

// ------------------------------------------------------------------- setup
void setup() {
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_MOTOR, OUTPUT);
  analogWrite(PIN_MOTOR, 0);

#if MIC_XIAO_SENSE_PDM
  i2s.setPinsPdmRx(PIN_PDM_CLK, PIN_PDM_DATA);
  i2s.begin(I2S_MODE_PDM_RX, SAMPLE_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);
#else
  i2s.setPins(PIN_I2S_SCK, PIN_I2S_WS, -1, PIN_I2S_SD);
  i2s.begin(I2S_MODE_STD, SAMPLE_RATE, I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO, I2S_STD_SLOT_LEFT);
#endif

  char name[20];
  snprintf(name, sizeof name, "MindMirror-%04X", (uint16_t)(ESP.getEfuseMac() >> 32));
  NimBLEDevice::init(name);
  NimBLEDevice::setMTU(247);
  NimBLEDevice::setPower(3);  // dBm: enough for a pocket, kind to the battery

  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCB());
  NimBLEService* svc = server->createService(SVC_UUID);
  chAudio = svc->createCharacteristic(AUDIO_UUID, NIMBLE_PROPERTY::NOTIFY);
  svc->createCharacteristic(CTRL_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR)->setCallbacks(new ControlCB());
  chState = svc->createCharacteristic(STATE_UUID, NIMBLE_PROPERTY::NOTIFY | NIMBLE_PROPERTY::READ);
  svc->start();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(SVC_UUID);
  adv->setName(name);
  adv->enableScanResponse(true);
  adv->start();

  buzz(60);
}

// -------------------------------------------------------------------- loop
uint16_t seq = 0;
bool wasDown = false;
uint32_t lastBattery = 0;

void streamFrame() {
  static int16_t pcm[FRAME_SAMPLES];
#if MIC_XIAO_SENSE_PDM
  i2s.readBytes((char*)pcm, sizeof pcm);
#else
  static int32_t raw[FRAME_SAMPLES];
  i2s.readBytes((char*)raw, sizeof raw);
  for (size_t i = 0; i < FRAME_SAMPLES; i++) pcm[i] = constrain(raw[i] >> 14, -32768, 32767);  // 24-bit -> 16-bit with ~4x gain
#endif
  uint8_t pkt[2 + ADPCM_BYTES];
  pkt[0] = seq & 0xff; pkt[1] = seq >> 8; seq++;
  for (size_t i = 0; i < FRAME_SAMPLES; i += 2) {
    uint8_t lo = adpcmNibble(pcm[i]);      // low nibble first (matches the web decoder)
    uint8_t hi = adpcmNibble(pcm[i + 1]);
    pkt[2 + i / 2] = lo | (hi << 4);
  }
  chAudio->setValue(pkt, sizeof pkt);
  chAudio->notify();
}

void loop() {
  bool down = digitalRead(PIN_BUTTON) == LOW;
  if (down && !wasDown) {                  // press: start a new utterance
    enc = Adpcm(); seq = 0;
    notifyState(0x10, 1);
    setMood(LISTENING);
    buzz(25);
  }
  if (!down && wasDown) {                  // release: app transcribes + replies
    notifyState(0x10, 0);
    setMood(THINKING);
  }
  wasDown = down;

  if (down && connected) streamFrame();    // blocks ~20 ms per frame on the I2S read
  else delay(10);

  if (millis() - lastBattery > 60000) { lastBattery = millis(); notifyState(0x20, batteryPercent()); }
  renderLed();
}
