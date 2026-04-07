import type { TranscodeFile, TranscodeProfile } from '$lib/types';

export type TranscodeProfileUpdater = (mutator: (profile: TranscodeProfile, file: TranscodeFile) => void) => void;

export type TranscodeOutputPathBuilder = (file: TranscodeFile) => string;
