/**
 * TeamSection — 직원 관리 위쪽의 팀 등록 칸 (2026-11-22)
 *
 * 팀을 먼저 만들고 직원(사전 등록 포함)에 팀을 정한다. 공간 관리에서 담당을 팀으로도 지정할 수 있다.
 */
import { useState, type FormEvent } from 'react';
import type useTeams from '../../hooks/useTeams';
import { TEAM_NAME_MAX } from '../../schemas/team';

interface Props {
    t: ReturnType<typeof useTeams>;
    /** 팀 ID → 직원 수(활성) */
    memberCount: (teamId: string) => number;
}

export default function TeamSection({ t, memberCount }: Props) {
    const [name, setName] = useState('');
    const [showArchived, setShowArchived] = useState(false);

    const handleAdd = async (e: FormEvent) => {
        e.preventDefault();
        if (await t.addTeam(name)) setName('');
    };

    return (
        <section className="glass-card p-4 mb-6" aria-labelledby="team-section-title">
            <h2 id="team-section-title" className="font-semibold text-surface-900 dark:text-surface-100">팀</h2>
            <p className="text-xs text-surface-500 dark:text-surface-400 mb-3">
                팀을 먼저 만들고 직원마다 팀을 정하세요. 공간 관리에서 담당을 팀으로 지정하면 그 팀 직원 모두가 그 공간을 조사합니다.
            </p>
            <form onSubmit={handleAdd} className="flex gap-2">
                <label htmlFor="new-team-name" className="sr-only">새 팀 이름</label>
                <input id="new-team-name" type="text" className="input flex-1 min-h-[48px]" value={name} maxLength={TEAM_NAME_MAX}
                    placeholder="예: 행정지원팀" onChange={(e) => setName(e.target.value)} />
                <button type="submit" className="btn-primary min-h-[48px] px-4" disabled={t.busy || !name.trim()}>팀 추가</button>
            </form>
            {t.activeTeams.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="팀 목록">
                    {t.activeTeams.map((team) => (
                        <li key={team.id} className="inline-flex items-center gap-1 pl-3 pr-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm">
                            {team.name}
                            <span className="text-xs text-primary-600/80 dark:text-primary-300/70">{memberCount(team.id)}명</span>
                            <button type="button" onClick={() => void t.renameTeam(team)} disabled={t.busy}
                                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-primary-100 dark:hover:bg-primary-800/50"
                                aria-label={`${team.name} 이름 바꾸기`}>
                                <span aria-hidden="true">✎</span>
                            </button>
                            <button type="button" onClick={() => void t.archiveTeam(team, memberCount(team.id))} disabled={t.busy}
                                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-primary-100 dark:hover:bg-primary-800/50"
                                aria-label={`${team.name} 숨기기`}>
                                <span aria-hidden="true">✕</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {t.archivedTeams.length > 0 && (
                <div className="mt-2">
                    <button type="button" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}
                        className="text-xs font-medium text-surface-600 dark:text-surface-300 min-h-[44px]">
                        {showArchived ? '▾' : '▸'} 숨긴 팀 {t.archivedTeams.length}개
                    </button>
                    {showArchived && (
                        <ul className="flex flex-wrap gap-2" aria-label="숨긴 팀 목록">
                            {t.archivedTeams.map((team) => (
                                <li key={team.id}>
                                    <button type="button" onClick={() => void t.restoreTeam(team)} disabled={t.busy}
                                        className="btn-secondary btn-sm min-h-[44px] px-3">{team.name} 다시 꺼내기</button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
}
