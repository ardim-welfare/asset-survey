import { z } from 'zod';
import { timestampSchema } from './common';

/** 건물 이름 길이 상한 — firestore.rules의 buildingDataValid와 같은 값 */
export const BUILDING_NAME_MAX = 50;
/** 건물 주소 길이 상한 — firestore.rules와 같은 값 */
export const BUILDING_ADDRESS_MAX = 200;
/** 건물 하나의 층 수 상한 — firestore.rules와 같은 값 */
export const BUILDING_FLOORS_MAX = 50;
/** 층 이름 길이 상한(B1, 1, PH, 옥상 등) — 공간의 floor와 같은 값 */
export const FLOOR_NAME_MAX = 10;

/**
 * 건물 (buildings/{buildingId}) — 공간을 묶는 위 단계 (2026-11-22, 구글 워크스페이스의
 * "건물 및 리소스"처럼 건물 → 층 → 공간 세 단계로 본다).
 *
 * - `floors`: 이 건물의 층 이름 목록, **낮은 층부터 높은 층 순서**(B2, B1, 1, 2, 3, PH).
 *   층은 문서를 따로 두지 않는다 — 층에 붙일 정보가 이름과 순서뿐이라서다.
 *   공간은 이 목록 중 하나를 `floor`에 담는다.
 * - `archived`: 지우지 않고 숨긴다(공간과 같은 이유 — 공간이 건물을 가리킨다). Rules도 delete를 막는다.
 * - `order`: 화면 표시 순서(작을수록 위).
 *
 * 조사·제출·승인의 단위는 여전히 공간이다. 건물·층은 공간을 묶어 보고 거르는 데만 쓴다.
 * Zod는 모르는 키를 조용히 지우므로 필드를 추가할 때는 firestore.rules의 `hasOnly`도 함께 고친다.
 */
export const buildingSchema = z.object({
    organizationId: z.string().catch(''),
    name: z.string().catch(''),
    address: z.string().catch(''),
    floors: z.array(z.string()).catch([]),
    order: z.number().catch(0),
    archived: z.boolean().catch(false),
    lastEditedByUid: z.string().optional().catch(undefined),
    createdAt: timestampSchema.optional().catch(undefined),
    updatedAt: timestampSchema.optional().catch(undefined),
});

export type BuildingSchemaType = z.infer<typeof buildingSchema>;
