/**
 * 재물 관련 타입 — 문서 모양의 원본은 `src/schemas/asset.ts`다. 여기서는 파생만 한다.
 */
import type { z } from 'zod';
import type {
    assetSchema, assetAccountingSchema, importRecordSchema, historySchema, assetStatusSchema,
} from '../schemas/asset';
import type { FirestoreDoc } from './common';

export type AssetStatus = z.infer<typeof assetStatusSchema>;
export type Asset = z.infer<typeof assetSchema> & FirestoreDoc;
export type AssetAccounting = z.infer<typeof assetAccountingSchema> & FirestoreDoc;
export type ImportRecord = z.infer<typeof importRecordSchema> & FirestoreDoc;
export type HistoryEntry = z.infer<typeof historySchema> & FirestoreDoc;

/** 재물 문서에서 가져오기가 채우는 값 */
export type AssetFields = Pick<Asset,
    'code' | 'name' | 'category' | 'spec' | 'acquiredAt' | 'acquiredQuantity' | 'quantity'
    | 'status' | 'statusRaw' | 'locationRaw' | 'spaceId' | 'department' | 'usage'>;

/** 금액 문서에서 가져오기가 채우는 값 */
export type AccountingFields = Pick<AssetAccounting, 'amount' | 'depreciation' | 'residual'>;
