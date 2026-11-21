import { describe, it, expect } from 'vitest';
import { resolveAuthDomain, hostingAuthDomains, HOSTING_AUTH_DOMAINS } from '../../lib/authDomain';

// vitest.config.js가 VITE_FIREBASE_PROJECT_ID=test-project 를 넣는다
const ENV_DOMAIN = 'test-project.firebaseapp.com';

describe('hostingAuthDomains', () => {
    it('프로젝트 ID로 기본 Hosting 도메인 둘을 만든다', () => {
        expect(hostingAuthDomains({ projectId: 'asset-survey' }))
            .toEqual(['asset-survey.web.app', 'asset-survey.firebaseapp.com']);
    });

    it('전용 도메인이 정해지면 맨 앞에 둔다', () => {
        expect(hostingAuthDomains({ projectId: 'asset-survey', appDomain: 'asset.example.org' }))
            .toEqual(['asset.example.org', 'asset-survey.web.app', 'asset-survey.firebaseapp.com']);
    });

    it('값이 없으면 빈 목록이다', () => {
        expect(hostingAuthDomains({})).toEqual([]);
    });
});

describe('resolveAuthDomain', () => {
    it.each([...HOSTING_AUTH_DOMAINS])('Hosting 도메인(%s)으로 접속하면 그 도메인을 authDomain으로 쓴다', (host) => {
        expect(resolveAuthDomain(ENV_DOMAIN, host)).toBe(host);
    });

    it('localhost는 환경변수 값을 쓴다', () => {
        expect(resolveAuthDomain(ENV_DOMAIN, 'localhost')).toBe(ENV_DOMAIN);
    });

    it('PR 미리보기 채널 도메인은 환경변수 값을 쓴다', () => {
        expect(resolveAuthDomain(ENV_DOMAIN, 'test-project--pr-392-4d6y2rk5.web.app')).toBe(ENV_DOMAIN);
    });

    it('비슷하지만 다른 도메인은 허용하지 않는다', () => {
        expect(resolveAuthDomain(ENV_DOMAIN, 'test-project.web.app.evil.com')).toBe(ENV_DOMAIN);
    });
});
