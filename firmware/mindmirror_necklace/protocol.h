// MindMirror Necklace BLE protocol, version 2.
// The single source of truth is docs/NECKLACE_PROTOCOL.md. This file and
// src/lib/necklace/protocol.ts must use exactly the same values.
#pragma once
#include <stdint.h>

#define NECKLACE_PROTOCOL 2
#define FW_MAJOR 2
#define FW_MINOR 0

// GATT
#define SVC_UUID        "6e400001-b5a3-f393-e0a9-e50e24dc4d4d"
#define AUDIO_UP_UUID   "6e400002-b5a3-f393-e0a9-e50e24dc4d4d"  // NOTIFY  [sess u8][seq u16][ADPCM bytes]
#define CTRL_UUID       "6e400003-b5a3-f393-e0a9-e50e24dc4d4d"  // WRITE   [op u8][args]
#define STATE_UUID      "6e400004-b5a3-f393-e0a9-e50e24dc4d4d"  // NOTIFY  [event u8][args]
#define AUDIO_DOWN_UUID "6e400005-b5a3-f393-e0a9-e50e24dc4d4d"  // WRITE_NR [clip u8][index u16][ADPCM bytes]

// Audio format, both directions: 16 kHz, mono, IMA ADPCM 4-bit, low nibble first.
#define AUDIO_RATE        16000
#define FRAME_SAMPLES     320      // 20 ms
#define MAX_RECORD_MS     30000
#define MAX_CLIP_BYTES    240000   // 30 s of ADPCM per clip
#define MAX_CLIPS         4

// App -> necklace (CTRL)
enum CtrlOp : uint8_t {
  OP_HELLO      = 0x01,  // -> EV_HELLO
  OP_THINKING   = 0x02,  // keep-alive while the phone works; LED shimmers
  OP_IDLE       = 0x03,
  OP_CALM       = 0x04,  // [cycles u8] breathing light
  OP_VOLUME     = 0x05,  // [0..100]
  OP_PLAY_LOCAL = 0x06,  // [clip u8] a phrase stored in the necklace (fallback / test)
  OP_STOP       = 0x07,  // stop playback and drop queued clips
  OP_ERROR      = 0x08,  // red flash
  OP_CLIP_BEGIN = 0x20,  // [clip u8][flags u8][rate u16][samples u32][bytes u32][crc32 u32][chunk u16]
  OP_CLIP_END   = 0x21,  // [clip u8] -> EV_CLIP_OK or EV_CLIP_BAD
  OP_CLIP_ABORT = 0x22,  // [clip u8]
};
#define CLIP_FLAG_LAST 0x01  // last clip of this reply

// Necklace -> app (STATE)
enum StateEv : uint8_t {
  EV_BUTTON_DOWN = 0x10,  // [sess u8]
  EV_REC_DONE    = 0x11,  // [sess u8][packets u16][bytes u32][reason u8: 0 released, 1 time limit]
  EV_BATTERY     = 0x20,  // [pct u8][mv u16]
  EV_HELLO       = 0x30,  // [proto u8][mtu u16][features u8][volume u8][fw major u8][fw minor u8]
  EV_CLIP_OK     = 0x31,  // [clip u8]
  EV_CLIP_BAD    = 0x32,  // [clip u8][first missing chunk u16][reason u8]
  EV_PLAY_START  = 0x33,  // [clip u8]
  EV_PLAY_DONE   = 0x34,  // [clip u8][interrupted u8]
  EV_REPLY_DONE  = 0x35,  // [ok u8]
  EV_ERROR       = 0x40,  // [code u8][detail u8]
};

#define FEAT_SPEAKER      0x01
#define FEAT_BATTERY      0x02
#define FEAT_LOCAL_CLIPS  0x04

enum ErrCode : uint8_t {
  ERR_NONE         = 0,
  ERR_NO_PSRAM     = 1,
  ERR_MIC_INIT     = 2,
  ERR_AMP_INIT     = 3,
  ERR_BAD_FORMAT   = 4,   // CLIP_BEGIN with an unsupported rate or size
  ERR_QUEUE_FULL   = 5,
  ERR_CLIP_TIMEOUT = 6,   // BEGIN without END in time, or next clip never came
  ERR_LOW_BATTERY  = 7,
  ERR_PHONE_SILENT = 8,   // no reply after recording; necklace played its own fallback
};

// CLIP_BAD reasons
#define BAD_MISSING 1
#define BAD_CRC     2
#define BAD_UNKNOWN 3

// Phrases stored in flash (clips.h), playable with OP_PLAY_LOCAL.
enum LocalClip : uint8_t {
  LOCAL_HELLO = 0, LOCAL_NO_PHONE = 1, LOCAL_RETRY = 2, LOCAL_TEST = 3, LOCAL_LOW_BATTERY = 4, LOCAL_ON_SCREEN = 5,
};

// Timeouts (ms)
#define CLIP_TRANSFER_TIMEOUT 10000  // BEGIN -> END
#define NEXT_CLIP_TIMEOUT     15000  // between clips of one reply
#define PHONE_SILENT_TIMEOUT  30000  // after recording, no THINKING keep-alive or clip
