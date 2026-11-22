/**
 * 건물 타입 — 문서 모양의 원본은 `src/schemas/building.ts`다. 여기서는 파생만 한다.
 */
import type { z } from 'zod';
import type { buildingSchema } from '../schemas/building';
import type { FirestoreDoc } from './common';

export type Building = z.infer<typeof buildingSchema> & FirestoreDoc;

/** 화면에서 고칠 수 있는 필드 */
export type BuildingPatch = Partial<Pick<Building, 'name' | 'address' | 'floors' | 'order' | 'archived'>>;
