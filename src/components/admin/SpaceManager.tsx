/**
 * SpaceManager — 공간 관리 (기관 관리자 전용, 기획서 F03)
 *
 * 재물이 놓인 곳(사무실·층·시설)을 등록하고 공간 담당자를 지정한다.
 * 상태와 저장은 useSpaceManager가 맡고, 여기는 표시만 한다.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import useSpaceManager from '../../hooks/useSpaceManager';
import { SkeletonList } from '../common/Skeleton';
import { SPACE_NAME_MAX } from '../../schemas/space';
import type { Space } from '../../types/space';

const ROLE_LABEL: Record<string, string> = { admin: '관리자', employee: '직원' };

export default function SpaceManager() {
    const navigate = useNavigate();
    const {
        loading, loadError, busy, reload,
        activeSpaces, archivedSpaces, members, nameOf,
        addSpace, renameSpace, moveSpace, addManager, removeManager, archiveSpace, restoreSpace,
    } = useSpaceManager();
    const [newName, setNewName] = useState('');
    const [showArchived, setShowArchived] = useState(false);

    const handleAdd = async (e: FormEvent) => {
        e.preventDefault();
        if (await addSpace(newName)) setNewName('');
    };

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-2">공간 관리</h1>
            <p className="text-sm text-surface-500 dark:text-surface-400 mb-6">
                재물이 놓인 곳(사무실·층·시설)을 등록하고 담당 직원을 정합니다. &lsquo;나눠서 조사&rsquo; 방식에서는
                공간 담당자가 자기 공간을 조사합니다. 조사 방식은{' '}
                <button type="button" onClick={() => navigate('/admin/settings')} className="underline underline-offset-2 text-primary-600 dark:text-primary-400">
                    설정
                </button>
                에서 바꿉니다.
            </p>

            {/* 공간 추가 */}
            <form onSubmit={handleAdd} className="glass-card p-4 mb-6 flex flex-col sm:flex-row gap-2">
                <label htmlFor="new-space-name" className="sr-only">새 공간 이름</label>
                <input
                    id="new-space-name"
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={SPACE_NAME_MAX}
                    placeholder="새 공간 이름 (예: 2층 사무실)"
                    className="input flex-1 min-h-[48px]"
                />
                <button type="submit" disabled={busy || !newName.trim()} className="btn-primary min-h-[48px] px-5">
                    공간 추가
                </button>
            </form>

            {loading ? (
                <SkeletonList count={3} />
            ) : loadError ? (
                <div className="glass-card p-6 text-center">
                    <p className="text-sm text-red-600 dark:text-red-400 mb-3">{loadError}</p>
                    <button type="button" onClick={reload} className="btn-secondary min-h-[48px] px-4">다시 불러오기</button>
                </div>
            ) : activeSpaces.length === 0 ? (
                <div className="glass-card p-8 text-center">
                    <div className="text-4xl mb-3" aria-hidden="true">🏢</div>
                    <p className="text-surface-700 dark:text-surface-300 font-medium">아직 등록한 공간이 없습니다</p>
                    <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                        위 칸에 공간 이름을 적어 추가하세요. 희망이음 대장의 위치 이름과 같게 쓰면 엑셀 가져오기 때 자동으로 맞춰집니다.
                    </p>
                </div>
            ) : (
                <ul className="space-y-3" aria-label="공간 목록">
                    {activeSpaces.map((space, index) => (
                        <SpaceCard
                            key={space.id}
                            space={space}
                            isFirst={index === 0}
                            isLast={index === activeSpaces.length - 1}
                            busy={busy}
                            members={members}
                            nameOf={nameOf}
                            onRename={() => renameSpace(space)}
                            onMove={(dir) => moveSpace(space, dir)}
                            onAddManager={(uid) => addManager(space, uid)}
                            onRemoveManager={(uid) => removeManager(space, uid)}
                            onArchive={() => archiveSpace(space)}
                        />
                    ))}
                </ul>
            )}

            {/* 숨긴 공간 */}
            {!loading && archivedSpaces.length > 0 && (
                <div className="mt-8">
                    <button
                        type="button"
                        onClick={() => setShowArchived((v) => !v)}
                        aria-expanded={showArchived}
                        className="text-sm font-medium text-surface-600 dark:text-surface-300 min-h-[48px] px-1"
                    >
                        {showArchived ? '▾' : '▸'} 숨긴 공간 {archivedSpaces.length}개
                    </button>
                    {showArchived && (
                        <ul className="space-y-2 mt-2" aria-label="숨긴 공간 목록">
                            {archivedSpaces.map((space) => (
                                <li key={space.id} className="glass-card p-4 flex items-center justify-between gap-3">
                                    <span className="text-sm text-surface-500 dark:text-surface-400 truncate">{space.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => restoreSpace(space)}
                                        disabled={busy}
                                        className="btn-secondary btn-sm min-h-[48px] px-3 flex-shrink-0"
                                    >
                                        다시 꺼내기
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

interface SpaceCardProps {
    space: Space;
    isFirst: boolean;
    isLast: boolean;
    busy: boolean;
    members: { uid: string; name: string; role: string }[];
    nameOf: (uid: string) => string;
    onRename: () => void;
    onMove: (direction: -1 | 1) => void;
    onAddManager: (uid: string) => void;
    onRemoveManager: (uid: string) => void;
    onArchive: () => void;
}

function SpaceCard({
    space, isFirst, isLast, busy, members, nameOf,
    onRename, onMove, onAddManager, onRemoveManager, onArchive,
}: SpaceCardProps) {
    const candidates = members.filter((m) => !space.managerUids.includes(m.uid));
    const selectId = `space-manager-${space.id}`;

    return (
        <li className="glass-card p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                    <h2 className="font-semibold text-surface-900 dark:text-surface-100 break-keep">{space.name}</h2>
                    <p className="text-xs text-surface-500 dark:text-surface-400">
                        {space.managerUids.length > 0 ? `담당자 ${space.managerUids.length}명` : '담당자 없음'}
                    </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button type="button" onClick={() => onMove(-1)} disabled={busy || isFirst}
                        className="btn-icon min-h-[48px] min-w-[48px]" aria-label={`${space.name} 위로`}>
                        <span aria-hidden="true">▲</span>
                    </button>
                    <button type="button" onClick={() => onMove(1)} disabled={busy || isLast}
                        className="btn-icon min-h-[48px] min-w-[48px]" aria-label={`${space.name} 아래로`}>
                        <span aria-hidden="true">▼</span>
                    </button>
                </div>
            </div>

            {/* 담당자 */}
            {space.managerUids.length > 0 && (
                <ul className="flex flex-wrap gap-2 mb-3" aria-label={`${space.name} 담당자`}>
                    {space.managerUids.map((uid) => (
                        <li key={uid} className="inline-flex items-center gap-1 pl-3 pr-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm">
                            {nameOf(uid)}
                            <button type="button" onClick={() => onRemoveManager(uid)} disabled={busy}
                                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-primary-100 dark:hover:bg-primary-800/50"
                                aria-label={`${nameOf(uid)} 담당자에서 빼기`}>
                                <span aria-hidden="true">✕</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
                <label htmlFor={selectId} className="sr-only">{space.name} 담당자 지정</label>
                <select
                    id={selectId}
                    value=""
                    onChange={(e) => onAddManager(e.target.value)}
                    disabled={busy || candidates.length === 0}
                    className="input flex-1 min-h-[48px]"
                >
                    <option value="">{candidates.length === 0 ? '지정할 직원이 없습니다' : '+ 담당자 지정'}</option>
                    {candidates.map((m) => (
                        <option key={m.uid} value={m.uid}>{m.name} ({ROLE_LABEL[m.role] ?? m.role})</option>
                    ))}
                </select>
                <div className="flex gap-2">
                    <button type="button" onClick={onRename} disabled={busy} className="btn-secondary min-h-[48px] px-3 flex-1 sm:flex-none">
                        이름 바꾸기
                    </button>
                    <button type="button" onClick={onArchive} disabled={busy}
                        className="btn-secondary min-h-[48px] px-3 flex-1 sm:flex-none text-amber-700 dark:text-amber-400">
                        숨기기
                    </button>
                </div>
            </div>
        </li>
    );
}
