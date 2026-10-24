// Pins for the Seeed Studio XIAO ESP32S3 Sense. Checked against the Seeed wiki
// pin table (D0..D10 -> GPIO) and the Sense board's own pins: mic on GPIO42/41,
// SD card on D8..D10 + GPIO21, camera on the B2B connector. Nothing below
// touches those.
#pragma once

// Built-in PDM microphone on the Sense board (fixed, do not change)
#define PIN_MIC_CLK   42
#define PIN_MIC_DATA  41

// MAX98357A I2S amplifier
#define PIN_AMP_BCLK  4   // D3
#define PIN_AMP_LRC   5   // D4
#define PIN_AMP_DIN   6   // D5

#define PIN_BUTTON    1   // D0, other leg to GND (internal pull-up)
#define PIN_LED       2   // D1 -> WS2812 DIN
#define PIN_BATTERY   3   // D2 <- middle of 2 x 100k divider from BAT+ (optional)

#define BATTERY_SENSE 0   // set to 1 once the divider is wired
#define MIC_GAIN      3   // software gain on the PDM mic (1..8)
#define DEFAULT_VOLUME 70 // 0..100, changed from the app and saved
#define LED_BRIGHTNESS 0.5f
