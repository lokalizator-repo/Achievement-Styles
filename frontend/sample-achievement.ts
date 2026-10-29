import type { Achievement } from './card';
import { translate } from './presentation';
import { sampleArtwork } from './ps5-assets';

export const sampleAchievement: Achievement = {
  get strName() { return translate('First achievement'); },
  get description() { return translate('Your adventure begins.'); },
  strImage: sampleArtwork,
  bAchieved: true,
};
