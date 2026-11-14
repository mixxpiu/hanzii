import type { WordInsight } from '../../types/vocab';
import { insights001_060 } from './part001_060';
import { insights061_120 } from './part061_120';
import { insights121_180 } from './part121_180';
import { insights181_240 } from './part181_240';
import { insights241_300 } from './part241_300';
import { insights301_345 } from './part301_345';
import { insights346_395 } from './part346_395';
import { insights396_445 } from './part396_445';
import { insights446_495 } from './part446_495';
import { insights496_540 } from './part496_540';
import { insights541_570 } from './part541_570';

export const WORD_INSIGHTS: Record<number, WordInsight> = {
  ...insights001_060,
  ...insights061_120,
  ...insights121_180,
  ...insights181_240,
  ...insights241_300,
  ...insights301_345,
  ...insights346_395,
  ...insights396_445,
  ...insights446_495,
  ...insights496_540,
  ...insights541_570,
};
