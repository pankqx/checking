// CRC-32 (IEEE 802.3, the same as zlib and PNG). crc32("123456789") = 0xCBF43926.
// Must match crc32() in src/lib/adpcm.ts.
#pragma once
#include <stdint.h>

static inline uint32_t crc32_update(uint32_t crc, const uint8_t* data, uint32_t len) {
  static uint32_t table[256];
  static bool ready = false;
  if (!ready) {
    for (uint32_t i = 0; i < 256; i++) {
      uint32_t c = i;
      for (int k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1;
      table[i] = c;
    }
    ready = true;
  }
  crc = ~crc;
  for (uint32_t i = 0; i < len; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >> 8);
  return ~crc;
}

static inline uint32_t crc32(const uint8_t* data, uint32_t len) { return crc32_update(0, data, len); }
