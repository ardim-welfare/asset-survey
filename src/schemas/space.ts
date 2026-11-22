import { z } from 'zod';
import { timestampSchema } from './common';

/** 공간 이름 길이 상한 — firestore.rules의 spaceDataValid와 같은 값 */
export const SPACE_NAME_MAX = 50;
/** 공간 하나에 지정할 수 있는 담당자 수 상한 — firestore.rules와 같은 값 */
export const SPACE_MANAGERS_MAX = 20;

/**
 * 공간 (spaces/{spaceId}) — 재물이 놓인 곳(사무실·층·시설). 기획서 F03.
 *
 * - `managerUids`: 이 공간의 **공간 담당자**. '나눠서 조사' 방식에서 이 사람들이 공간을 조사·제출한다.
 *   역할(`role`)이 아니라 공간에 사람을 붙이는 방식이라, 직원도 관리자도 담당자가 될 수 있다.
 * - `archived`: 지우지 않고 숨긴다. 재물·조사 기록이 공간을 가리키게 되므로(2~4단계) 삭제는 없다 —
 *   Rules도 delete를 막는다.
 * - `order`: 화면 표시 순서(작을수록 위). 엑셀 위치 대응·보고서도 이 순서를 따른다.
 *   건물·층으로 묶어 보일 때는 같은 건물·층 안에서 이 순서를 따른다.
 * - `buildingId`·`floor`: 이 공간이 있는 건물(buildings 문서 ID)과 층(그 건물의 floors 중 하나).
 *   둘 다 비워 둘 수 있다 — 건물이 하나뿐인 작은 기관은 건물을 등록하지 않고 지금처럼 쓴다(2026-11-22).
 *
 * Zod는 모르는 키를 조용히 지우므로 필드를 추가할 때는 이 파일과 firestore.rules의
 * `hasOnly` 목록을 함께 고친다.
 */
export const spaceSchema = z.object({
    organizationId: z.string().catch(''),
    name: z.string().catch(''),
    order: z.number().catch(0),
    managerUids: z.array(z.string()).catch([]),
    archived: z.boolean().catch(false),
    buildingId: z.string().nullable().catch(null),
    floor: z.string().nullable().catch(null),
    lastEditedByUid: z.string().optional().catch(undefined),
    createdAt: timestampSchema.optional().catch(undefined),
    updatedAt: timestampSchema.optional().catch(undefined),
});

export type SpaceSchemaType = z.infer<typeof spaceSchema>;
