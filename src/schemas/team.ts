import { z } from 'zod';
import { timestampSchema } from './common';

/** 팀 이름 길이 상한 — firestore.rules teamDataValid와 같은 값 */
export const TEAM_NAME_MAX = 50;

/**
 * 팀 (teams/{teamId}) — 2026-11-22. 직원은 한 팀에 속하고(users.teamId), 공간 담당을 팀으로도 지정한다(spaces.teamIds).
 *
 * 팀원 명단은 팀 문서에 두지 않는다 — 직원 문서의 teamId가 원본이다(한 곳에서만 바뀌게).
 * 공간 담당 권한은 Rules가 찍는 사람의 teamId를 읽어 확인하므로, 팀원이 바뀌어도 맞출 것이 없다.
 * 지우지 않고 숨긴다(archived) — 공간·직원이 팀을 가리킨다.
 */
export const teamSchema = z.object({
    organizationId: z.string().catch(''),
    name: z.string().catch(''),
    order: z.number().catch(0),
    archived: z.boolean().catch(false),
    lastEditedByUid: z.string().optional().catch(undefined),
    createdAt: timestampSchema.optional().catch(undefined),
    updatedAt: timestampSchema.optional().catch(undefined),
});

export type TeamSchemaType = z.infer<typeof teamSchema>;
