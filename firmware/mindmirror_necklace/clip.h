// One reply clip being received or played. Lives in a header so the Arduino
// builder's generated prototypes can see the type.
#pragma once
#include <stdint.h>

enum ClipState : uint8_t { C_FREE, C_RECEIVING, C_READY, C_PLAYING };

struct Clip {
  volatile ClipState state = C_FREE;
  uint8_t id = 0, flags = 0;
  uint32_t samples = 0, bytes = 0, crc = 0, order = 0, touched = 0;
  uint16_t chunk = 0, nChunks = 0, received = 0;
  uint8_t* data = nullptr;    // MAX_CLIP_BYTES in PSRAM
  uint8_t* bitmap = nullptr;  // one bit per received chunk
};

#define BITMAP_BYTES 2048  // up to 16384 chunks per clip
