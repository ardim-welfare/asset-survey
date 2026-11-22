/**
 * 팀 타입 — 문서 모양의 원본은 `src/schemas/team.ts`다.
 */
import type { z } from 'zod';
import type { teamSchema } from '../schemas/team';
import type { FirestoreDoc } from './common';

export type Team = z.infer<typeof teamSchema> & FirestoreDoc;
export type TeamPatch = Partial<Pick<Team, 'name' | 'order' | 'archived'>>;
