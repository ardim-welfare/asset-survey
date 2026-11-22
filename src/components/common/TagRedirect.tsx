/**
 * TagRedirect — 라벨 QR 주소(`/t/태그ID`)를 그 재물 화면으로 잇는다 (기획서 F09)
 *
 * 휴대폰 기본 카메라로 라벨을 찍으면 이 주소가 열린다. 로그인한 사람의 기관 안에서만 찾는다 —
 * 다른 기관 라벨이면 "이 기관에 없는 라벨"로 안내한다(어느 기관 것인지도 알려 주지 않는다).
 * 로그인 전이었다면 main.tsx가 태그를 보관했다가 로그인 뒤 이리로 다시 보낸다(pendingTag.ts).
 *
 * 라벨을 찍었다는 것은 물건이 눈앞에 있다는 뜻이라, 찾으면 '마지막 확인'을 남긴다(2026-11-22, 상시 확인 기록).
 * 재물 목록에서 눌러 여는 것은 확인으로 치지 않는다 — 이 경로(실물 QR)만 남긴다.
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { findAssetByTag, recordAssetCheck } from '../../lib/firestore';
import { parseTag } from '../../lib/labels/tag';
import { clearPendingTag } from '../../lib/pendingTag';

type State = { kind: 'loading' } | { kind: 'found'; path: string } | { kind: 'notFound' } | { kind: 'error' };

export default function TagRedirect() {
    const { tagId: raw } = useParams<{ tagId: string }>();
    const { userData } = useAuth();
    const orgId = userData?.organizationId ?? null;
    const base = userData?.role === 'employee' ? '/employee' : '/admin';
    const tag = parseTag(raw ?? '');
    const [state, setState] = useState<State>(tag ? { kind: 'loading' } : { kind: 'notFound' });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => { clearPendingTag(); }, []);

    useEffect(() => {
        if (!tag || !orgId) return;
        let cancelled = false;
        setState({ kind: 'loading' });
        findAssetByTag(orgId, tag)
            .then((a) => {
                if (cancelled) return;
                if (a) recordAssetCheck({ orgId, assetId: a.id, via: 'qr' });
                setState(a ? { kind: 'found', path: `${base}/assets/${encodeURIComponent(a.id)}` } : { kind: 'notFound' });
            })
            .catch(() => { if (!cancelled) setState({ kind: 'error' }); });
        return () => { cancelled = true; };
    }, [tag, orgId, base, attempt]);

    if (state.kind === 'found') return <Navigate to={state.path} replace state={{ justChecked: true }} />;

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-surface-50 dark:bg-surface-950">
            <div className="glass-card p-6 max-w-sm w-full text-center">
                {state.kind === 'loading' ? (
                    <>
                        <div className="w-8 h-8 spinner mx-auto mb-3" />
                        <p className="text-surface-600 dark:text-surface-300">재물을 찾는 중…</p>
                    </>
                ) : (
                    <>
                        <p className="text-4xl mb-3" aria-hidden="true">🏷️</p>
                        <p className="font-medium text-surface-900 dark:text-surface-100 mb-1">
                            {state.kind === 'error' ? '재물을 찾지 못했습니다' : '이 기관에 없는 라벨입니다'}
                        </p>
                        <p className="text-sm text-surface-500 dark:text-surface-400 mb-4">
                            {state.kind === 'error'
                                ? '인터넷 연결을 확인하고 다시 시도해 주세요.'
                                : '다른 기관의 라벨이거나 잘못 읽힌 QR입니다. 라벨의 자산코드로 재물 목록에서 찾아 주세요.'}
                        </p>
                        <div className="flex justify-center gap-2">
                            {state.kind === 'error' && (
                                <button type="button" className="btn-secondary min-h-[48px] px-4" onClick={() => setAttempt((n) => n + 1)}>다시 시도</button>
                            )}
                            <Link to={`${base}/assets`} className="btn-primary min-h-[48px] px-5">재물 목록</Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
