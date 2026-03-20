# V2 Watermark Strategy (savd-app)

This app implements the V2 browser verification flow.

## Bootstrap

- Decode user id from keyless right-side payload using V2 marker-aware decode.
- Bootstrap frames are `0,1,2` in encoded assets.
- Playback unlock requires frame-0 verification success.

## Continuous playback verification

- Verify every 10th frame while playback is active.
- RSA public key is fetched once after user-id decode and reused.
- On inconclusive checkpoint, allow one grace checkpoint.
- On second consecutive inconclusive checkpoint, block playback.
- On cryptographic mismatch, block playback immediately.

## V2 payload

- Right-side prefix: calibration marker `059059`, then fixed 9-digit user id.
- Left-side: 256-byte RSA signature bytes from 5-pixel groups.

See backend canonical spec: `saivd-backend/docs/V2_WATERMARK_SPEC.md`.
