import { z } from 'zod';
import { timestampSchema } from './common';

/**
 * 재물 마지막 확인 (assetChecks/{assetId}) — 2026-11-22, 상시 확인 기록
 *
 * 조사를 열지 않아도 라벨 QR을 찍으면 "이 물건이 실제로 있다"는 확인이 남는다.
 * 재물마다 **마지막 한 건만** 둔다(문서 ID = 재물 문서 ID) — 이력이 아니라 "언제 마지막으로 봤나"를 보려는 기록이라
 * 찍을 때마다 문서가 쌓이지 않게 했다. 조사 중 스캔도 같은 문서를 갱신한다.
 *
 * - `via`: 'qr'(휴대폰 카메라로 라벨을 찍어 연 경우) | 'survey'(조사 스캔)
 * - `spaceId`: 찍은 공간 — 조사 스캔만 안다. QR로 열면 어디서 찍었는지 몰라 null
 * - `checkedByUid`: 찍은 사람(조사 스캔의 scannedByUid와 같은 수준의 기록)
 *
 * 재물(assets) 문서에 두지 않은 이유: 재물은 관리자만 쓸 수 있는데, 확인은 직원도 남겨야 한다.
 */
export const assetCheckViaSchema = z.enum(['qr', 'survey']);

export const assetCheckSchema = z.object({
    organizationId: z.string().catch(''),
    assetId: z.string().catch(''),
    checkedAt: timestampSchema.optional().catch(undefined),
    checkedByUid: z.string().catch(''),
    via: assetCheckViaSchema.catch('qr'),
    spaceId: z.string().nullable().catch(null),
    surveyId: z.string().nullable().catch(null),
});

export type AssetCheckSchemaType = z.infer<typeof assetCheckSchema>;
