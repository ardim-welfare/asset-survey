import { describe, it, expect } from 'vitest';
import { userSchema, organizationSchema } from '../../schemas/index';

describe('핵심 엔티티 Zod 스키마 검증', () => {
    
    describe('userSchema', () => {
        it('올바른 사용자 데이터를 파싱하면 그대로 데이터를 성공적으로 보존한다', () => {
            const validUser = {
                id: 'user-001',
                uid: 'uid-abc',
                name: '장보고',
                email: 'jang@ocean.com',
                role: 'admin',
                organizationId: 'org-123',
                status: 'active',
                theme: 'dark',
            };
            
            const result = userSchema.safeParse(validUser);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.name).toBe('장보고');
                expect(result.data.role).toBe('admin');
            }
        });

        it('중요 필드가 누락되거나 자료형이 맞지 않는 경우 catch() 기능이 안전한 기본값으로 자동 교정한다', () => {
            const invalidUser = {
                // id는 스키마가 아니라 컨버터가 snapshot.id로 부여한다 — 문서 필드가 아니다
                name: 12345, // string에 number 주입 -> catch('-')
                email: 12345, // string에 number 주입 -> catch('')
                role: 'super_ultra_admin', // enum에 없는 권한 주입 -> catch('employee')
                organizationId: {}, // string에 object 주입 -> catch(null)
                status: 'invalid-status', // enum에 없는 상태 주입 -> catch('active')
            };

            const result = userSchema.safeParse(invalidUser);
            expect(result.success).toBe(true); // catch()가 모든 타입 에러를 가로채 기본값으로 복구하므로 success는 true임
            if (result.success) {
                expect(result.data.name).toBe('-'); // name 에러 -> 기본값 '-'
                expect(result.data.email).toBe(''); // email 에러 -> 기본값 ''
                expect(result.data.role).toBe('employee'); // 잘못된 role -> 기본값 'employee'
                expect(result.data.organizationId).toBeNull(); // 잘못된 orgId -> 기본값 null
                expect(result.data.status).toBe('active'); // 잘못된 status -> 기본값 'active'
            }
        });
    });

    describe('organizationSchema', () => {
        it('올바른 기관 정보를 정상 파싱한다', () => {
            const validOrg = {
                id: 'org-abc',
                name: '푸른돌 복지관',
                applicantUid: 'uid-applicant',
                status: 'approved',
            };

            const result = organizationSchema.safeParse(validOrg);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.name).toBe('푸른돌 복지관');
                expect(result.data.status).toBe('approved');
            }
        });

        it('기관명 유실 시 빈 문자열, 승인 상태 불일치 시 pending 상태로 자동 복원한다', () => {
            const corruptOrg = {
                name: 12345, // string에 number -> catch('')
                applicantUid: 999, // string에 number -> catch('')
                status: 'invalid-status', // enum 범위를 벗어난 문자열 -> catch('pending')
            };
            const result = organizationSchema.safeParse(corruptOrg);
            
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.name).toBe('');
                expect(result.data.applicantUid).toBe('');
                expect(result.data.status).toBe('pending');
            }
        });
    });

});
