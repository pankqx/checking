// Native check that the firmware's ADPCM + CRC-32 match the app's.
// Build and run: g++ -std=c++17 -I../mindmirror_necklace golden.cpp -o golden && ./golden
// The printed values are asserted in src/lib/necklace/necklace.test.ts.
#include <cstdio>
#include <cstring>
#include "adpcm.h"
#include "crc32.h"

int main() {
  const int N = 4000;
  static int16_t pcm[N], back[N];
  static uint8_t enc[N / 2];
  uint32_t s = 1;
  for (int i = 0; i < N; i++) {
    s = s * 1103515245u + 12345u;
    int tri = (int)((i * 37) % 2000) - 1000;
    pcm[i] = (int16_t)(tri * 13 + (int)((s >> 16) & 0x3ff) - 512);
  }
  AdpcmState e;
  adpcm_encode(e, pcm, N, enc);
  AdpcmState d;
  adpcm_decode(d, enc, N / 2, back);
  long long sum = 0;
  for (int i = 0; i < N; i++) sum += back[i];
  printf("crc123456789=%08x\nencCrc=%08x\ndecodedSum=%lld\n", crc32((const uint8_t*)"123456789", 9), crc32(enc, N / 2), sum);
}
