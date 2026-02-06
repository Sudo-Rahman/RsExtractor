import type { TranscriptionData } from './deepgram';
import type { VideoOcrPersistenceData } from './video-ocr';

export interface RsextData {
  version: 1;
  audioToSubs?: TranscriptionData;
  videoOcr?: VideoOcrPersistenceData;
}
