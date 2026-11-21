/**
 * 조사 관련 타입 — 문서 모양의 원본은 `src/schemas/survey.ts`다. 여기서는 파생만 한다.
 */
import type { z } from 'zod';
import type {
    surveySchema, surveyTargetSchema, surveyTargetItemSchema, scanSchema,
    scanResultSchema, scanMethodSchema, scanConditionSchema, surveyStatusSchema,
} from '../schemas/survey';
import type { FirestoreDoc } from './common';

export type Survey = z.infer<typeof surveySchema> & FirestoreDoc;
export type SurveyStatus = z.infer<typeof surveyStatusSchema>;
export type SurveyTarget = z.infer<typeof surveyTargetSchema> & FirestoreDoc;
export type SurveyTargetItem = z.infer<typeof surveyTargetItemSchema>;
export type Scan = z.infer<typeof scanSchema> & FirestoreDoc;
export type ScanResult = z.infer<typeof scanResultSchema>;
export type ScanMethod = z.infer<typeof scanMethodSchema>;
export type ScanCondition = z.infer<typeof scanConditionSchema>;
