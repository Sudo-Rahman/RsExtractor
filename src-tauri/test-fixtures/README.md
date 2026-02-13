# Rust Test Fixtures

This folder contains local media fixtures used by Rust integration tests.

- `media/sample_video.mp4`: local video+audio sample for ffprobe/ffmpeg/transcode/merge tests.
- `media/sample_ocr_video.mp4`: local video with text for OCR pipeline tests.

Tests must use these local files through `src/test_support/assets.rs`.
No runtime download from internet is allowed in tests.