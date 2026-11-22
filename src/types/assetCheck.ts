/**
 * 재물 마지막 확인 타입 — 문서 모양의 원본은 `src/schemas/assetCheck.ts`다.
 */
import type { z } from 'zod';
import type { assetCheckSchema, assetCheckViaSchema } from '../schemas/assetCheck';
import type { FirestoreDoc } from './common';

export type AssetCheck = z.infer<typeof assetCheckSchema> & FirestoreDoc;
export type AssetCheckVia = z.infer<typeof assetCheckViaSchema>;
