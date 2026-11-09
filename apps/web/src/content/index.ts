import type { Module } from '@/features/learn/types';
import { analog } from './analog';
import { basics } from './basics';
import { digital } from './digital';
import { micro } from './micro';
import { solar } from './solar';

export const MODULES: Module[] = [basics, analog, digital, micro, solar];
