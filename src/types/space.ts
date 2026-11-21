/**
 * 공간 타입 — 문서 모양의 원본은 `src/schemas/space.ts`다. 여기서는 파생만 한다.
 */
import type { z } from 'zod';
import type { spaceSchema } from '../schemas/space';
import type { FirestoreDoc } from './common';

export type Space = z.infer<typeof spaceSchema> & FirestoreDoc;

/** 화면에서 고칠 수 있는 필드 */
export type SpacePatch = Partial<Pick<Space, 'name' | 'order' | 'managerUids' | 'archived'>>;
