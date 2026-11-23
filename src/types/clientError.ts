/**
 * 앱 오류 기록 타입 — 원본은 `src/schemas/clientError.ts`다(여기서는 파생만 한다).
 */
import type { z } from 'zod';
import type { clientErrorSchema } from '../schemas/clientError';
import type { FirestoreDoc } from './common';

export type ClientError = z.infer<typeof clientErrorSchema> & FirestoreDoc;
