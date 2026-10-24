// IMA ADPCM, 4 bits per sample, low nibble first.
// Must match src/lib/adpcm.ts byte for byte. Both sides start every
// recording and every reply clip from pred = 0, index = 0.
#pragma once
#include <stdint.h>

static const int16_t ADPCM_STEP[89] = {
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97,
  107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
  876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871,
  5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623,
  27086, 29794, 32767};
static const int8_t ADPCM_INDEX[8] = {-1, -1, -1, -1, 2, 4, 6, 8};

struct AdpcmState {
  int32_t pred = 0;
  int32_t index = 0;
  void reset() { pred = 0; index = 0; }
};

static inline int32_t adpcm_clamp(int32_t v, int32_t lo, int32_t hi) { return v < lo ? lo : (v > hi ? hi : v); }

static inline uint8_t adpcm_encode_sample(AdpcmState& s, int16_t sample) {
  int32_t step = ADPCM_STEP[s.index];
  int32_t diff = sample - s.pred;
  uint8_t nib = 0;
  if (diff < 0) { nib = 8; diff = -diff; }
  int32_t vp = step >> 3;
  if (diff >= step) { nib |= 4; diff -= step; vp += step; }
  step >>= 1;
  if (diff >= step) { nib |= 2; diff -= step; vp += step; }
  step >>= 1;
  if (diff >= step) { nib |= 1; vp += step; }
  s.pred = adpcm_clamp(s.pred + ((nib & 8) ? -vp : vp), -32768, 32767);
  s.index = adpcm_clamp(s.index + ADPCM_INDEX[nib & 7], 0, 88);
  return nib;
}

static inline int16_t adpcm_decode_nibble(AdpcmState& s, uint8_t nib) {
  int32_t step = ADPCM_STEP[s.index];
  int32_t diff = step >> 3;
  if (nib & 4) diff += step;
  if (nib & 2) diff += step >> 1;
  if (nib & 1) diff += step >> 2;
  s.pred = adpcm_clamp(s.pred + ((nib & 8) ? -diff : diff), -32768, 32767);
  s.index = adpcm_clamp(s.index + ADPCM_INDEX[nib & 7], 0, 88);
  return (int16_t)s.pred;
}

// n must be even. Writes n / 2 bytes.
static inline void adpcm_encode(AdpcmState& s, const int16_t* pcm, uint32_t n, uint8_t* out) {
  for (uint32_t i = 0; i + 1 < n; i += 2) {
    uint8_t lo = adpcm_encode_sample(s, pcm[i]);
    uint8_t hi = adpcm_encode_sample(s, pcm[i + 1]);
    out[i / 2] = lo | (hi << 4);
  }
}

// Writes 2 * nbytes samples.
static inline void adpcm_decode(AdpcmState& s, const uint8_t* in, uint32_t nbytes, int16_t* pcm) {
  for (uint32_t i = 0; i < nbytes; i++) {
    pcm[2 * i] = adpcm_decode_nibble(s, in[i] & 0x0f);
    pcm[2 * i + 1] = adpcm_decode_nibble(s, in[i] >> 4);
  }
}
