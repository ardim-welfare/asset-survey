/**
 * SpaceManager — 공간 관리 (기관 관리자 전용, 기획서 F03)
 *
 * 재물이 놓인 곳(사무실·시설)을 등록하고 공간 담당자를 지정한다.
 * 상태와 저장은 useSpaceManager가 맡고, 여기는 표시만 한다.
 *
 * ## 건물 → 층 → 공간 (2026-11-22)
 * 구글 워크스페이스의 "건물 및 리소스"처럼 건물과 층을 따로 등록하고, 공간은 건물·층을 골라 둔다.
 * 화면은 [공간] [건물·층] 두 탭이다. 건물을 하나도 등록하지 않은 기관은 예전처럼 공간만 한 줄로 보인다
 * (건물이 한 곳뿐인 작은 기관이 할 일을 늘리지 않으려고).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import useSpaceManager from '../../hooks/useSpaceManager';
import useTeams from '../../hooks/useTeams';
import { useAuth } from '../../hooks/useAuth';
import type { Team } from '../../types/team';
import { SkeletonList } from '../common/Skeleton';
import { SPACE_NAME_MAX } from '../../schemas/space';
import { groupSpacesByLocation } from '../../lib/spaceGroups';
import LocationSelects from './space/LocationSelects';
import BuildingPanel from './space/BuildingPanel';
import PanelModal from './space/PanelModal';
import type { Space } from '../../types/space';
import type { Building } from '../../types/building';
import type { SpaceLocation } from '../../lib/firestore/spaces';

const ROLE_LABEL: Record<string, string> = { admin: '관리자', employee: '직원' };
const NO_LOCATION: SpaceLocation = { buildingId: null, floor: null };

type Tab = 'spaces' | 'buildings';

export default function SpaceManager() {
    const {
        loading, loadError, busy, reload,
        activeSpaces, archivedSpaces, members, nameOf,
        addSpace, renameSpace, moveSpace, setSpaceLocation, addManager, removeManager, addTeam, removeTeam, archiveSpace, restoreSpace,
        activeBuildings, archivedBuildings, spacesIn,
        addBuilding, editBuilding, moveBuilding, archiveBuilding, restoreBuilding,
    } = useSpaceManager();
    const { userData } = useAuth();
    const teamsState = useTeams(userData?.organizationId);
    const [tab, setTab] = useState<Tab>('spaces');
    const [newName, setNewName] = useState('');
    const [newLocation, setNewLocation] = useState<SpaceLocation>(NO_LOCATION);
    const [showArchived, setShowArchived] = useState(false);
    const [locating, setLocating] = useState<Space | null>(null);

    const hasBuildings = activeBuildings.length > 0;
    const groups = useMemo(() => groupSpacesByLocation(activeSpaces, activeBuildings), [activeSpaces, activeBuildings]);

    const handleAdd = async (e: FormEvent) => {
        e.preventDefault();
        if (await addSpace(newName, newLocation)) setNewName(''); // 같은 건물·층에 이어서 넣기 쉽게 위치는 남긴다
    };

    const renderCard = (space: Space, isFirst: boolean, isLast: boolean) => (
        <SpaceCard
            key={space.id}
            space={space}
            isFirst={isFirst}
            isLast={isLast}
            busy={busy}
            members={members}
            nameOf={nameOf}
            showLocation={hasBuildings}
            onRename={() => renameSpace(space)}
            onMove={(dir) => moveSpace(space, dir)}
            onLocate={() => setLocating(space)}
            onAddManager={(uid) => addManager(space, uid)}
            onRemoveManager={(uid) => removeManager(space, uid)}
            teams={teamsState.activeTeams}
            teamName={teamsState.teamName}
            onAddTeam={(teamId) => addTeam(space, teamId)}
            onRemoveTeam={(teamId) => removeTeam(space, teamId)}
            onArchive={() => archiveSpace(space)}
        />
    );

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-2">공간 관리</h1>
            <p className="text-sm text-surface-500 dark:text-surface-400 mb-4">
                재물이 놓인 곳(사무실·시설)을 등록하고 담당 직원을 정합니다. 건물이 여러 곳이면 [건물·층]에서 건물과 층을 먼저 등록하세요.
                &lsquo;나눠서 조사&rsquo; 방식에서는 공간 담당자가 자기 공간을 조사합니다. 조사 방식은{' '}
                <Link to="/admin/settings" className="underline underline-offset-2 text-primary-700 dark:text-primary-300 font-medium">
                    설정
                </Link>
                에서 바꿉니다.
            </p>

            <div role="tablist" aria-label="공간 관리 보기" className="flex gap-1 p-1 mb-6 rounded-xl bg-surface-100 dark:bg-surface-800 w-full sm:w-auto sm:inline-flex">
                {([['spaces', `공간 ${activeSpaces.length}`], ['buildings', `건물·층 ${activeBuildings.length}`]] as const).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        id={`space-tab-${key}`}
                        aria-selected={tab === key}
                        aria-controls={`space-panel-${key}`}
                        onClick={() => setTab(key)}
                        className={`flex-1 sm:flex-none min-h-[44px] px-4 rounded-lg text-sm font-medium transition-colors ${tab === key
                            ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 shadow-sm'
                            : 'text-surface-600 dark:text-surface-400'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'buildings' ? (
                <div role="tabpanel" id="space-panel-buildings" aria-labelledby="space-tab-buildings">
                    {loading ? <SkeletonList count={2} /> : (
                        <BuildingPanel
                            busy={busy}
                            activeBuildings={activeBuildings}
                            archivedBuildings={archivedBuildings}
                            spacesIn={spacesIn}
                            addBuilding={addBuilding}
                            editBuilding={editBuilding}
                            moveBuilding={moveBuilding}
                            archiveBuilding={archiveBuilding}
                            restoreBuilding={restoreBuilding}
                        />
                    )}
                </div>
            ) : (
                <div role="tabpanel" id="space-panel-spaces" aria-labelledby="space-tab-spaces">
                    {/* 공간 추가 */}
                    <form onSubmit={handleAdd} className="glass-card p-4 mb-6 flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row gap-2">
                            <label htmlFor="new-space-name" className="sr-only">새 공간 이름</label>
                            <input
                                id="new-space-name"
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                maxLength={SPACE_NAME_MAX}
                                placeholder="새 공간 이름 (예: 상담실, 프로그램실1)"
                                className="input flex-1 min-h-[48px]"
                            />
                            <button type="submit" disabled={busy || !newName.trim()} className="btn-primary min-h-[48px] px-5">
                                공간 추가
                            </button>
                        </div>
                        {hasBuildings && (
                            <LocationSelects idPrefix="new-space" buildings={activeBuildings} value={newLocation} onChange={setNewLocation} disabled={busy} />
                        )}
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
                    ) : !hasBuildings ? (
                        <ul className="space-y-3" aria-label="공간 목록">
                            {activeSpaces.map((space, index) => renderCard(space, index === 0, index === activeSpaces.length - 1))}
                        </ul>
                    ) : (
                        <div className="space-y-8">
                            {groups.map((g) => (
                                <section key={g.buildingId ?? 'none'} aria-labelledby={`bld-${g.buildingId ?? 'none'}`}>
                                    <h2 id={`bld-${g.buildingId ?? 'none'}`} className="flex items-baseline gap-2 text-lg font-bold text-surface-900 dark:text-surface-100 mb-3">
                                        <span aria-hidden="true">{g.buildingId ? '🏫' : '📦'}</span>
                                        {g.label}
                                        <span className="text-sm font-normal text-surface-500 dark:text-surface-400">공간 {g.count}개</span>
                                    </h2>
                                    {g.count === 0 ? (
                                        <p className="text-sm text-surface-500 dark:text-surface-400 px-1">이 건물에 등록한 공간이 없습니다. 위 칸에서 건물을 골라 추가하세요.</p>
                                    ) : (
                                        <div className="space-y-4">
                                            {g.floors.map((f) => (
                                                <div key={f.floor ?? 'none'}>
                                                    {f.label && (
                                                        <h3 className="text-sm font-semibold text-primary-700 dark:text-primary-300 mb-2 px-1">{f.label}</h3>
                                                    )}
                                                    <ul className="space-y-3" aria-label={`${g.label} ${f.label} 공간 목록`.trim()}>
                                                        {f.spaces.map((space, i) => renderCard(space, i === 0, i === f.spaces.length - 1))}
                                                    </ul>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            ))}
                        </div>
                    )}

                    {/* 숨긴 공간 */}
                    {!loading && archivedSpaces.length > 0 && (
                        <div className="mt-8">
                            <button
                                type="button"
                                onClick={() => setShowArchived((v) => !v)}
                                aria-expanded={showArchived}
                                className="btn-secondary btn-sm min-h-[44px]"
                            >
                                <span aria-hidden="true">{showArchived ? '▾' : '▸'}</span> 숨긴 공간 {archivedSpaces.length}개
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
            )}

            <SpaceLocationModal
                space={locating}
                buildings={activeBuildings}
                busy={busy}
                onClose={() => setLocating(null)}
                onSave={async (loc) => {
                    if (locating) await setSpaceLocation(locating, loc);
                    setLocating(null);
                }}
            />
        </div>
    );
}

/** 공간 위치(건물·층) 바꾸기 창 */
function SpaceLocationModal({ space, buildings, busy, onClose, onSave }: {
    space: Space | null;
    buildings: Building[];
    busy: boolean;
    onClose: () => void;
    onSave: (loc: SpaceLocation) => void;
}) {
    return (
        <PanelModal open={space !== null} title={space ? `'${space.name}' 위치 바꾸기` : ''} titleId="space-location-title" onClose={onClose}>
            {space && (
                <LocationForm
                    key={space.id}
                    initial={{ buildingId: space.buildingId ?? null, floor: space.floor ?? null }}
                    buildings={buildings}
                    busy={busy}
                    onCancel={onClose}
                    onSave={onSave}
                />
            )}
        </PanelModal>
    );
}

function LocationForm({ initial, buildings, busy, onCancel, onSave }: {
    initial: SpaceLocation;
    buildings: Building[];
    busy: boolean;
    onCancel: () => void;
    onSave: (loc: SpaceLocation) => void;
}) {
    const [loc, setLoc] = useState<SpaceLocation>(initial);
    return (
        <div className="space-y-4">
            <LocationSelects idPrefix="locate-space" buildings={buildings} value={loc} onChange={setLoc} disabled={busy} />
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="btn-secondary min-h-[48px] px-4">취소</button>
                <button type="button" onClick={() => onSave(loc)} disabled={busy} className="btn-primary min-h-[48px] px-5">저장</button>
            </div>
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
    showLocation: boolean;
    onRename: () => void;
    onMove: (direction: -1 | 1) => void;
    onLocate: () => void;
    onAddManager: (uid: string) => void;
    onRemoveManager: (uid: string) => void;
    teams: Team[];
    teamName: (id: string) => string | null;
    onAddTeam: (teamId: string) => void;
    onRemoveTeam: (teamId: string) => void;
    onArchive: () => void;
}

function SpaceCard({
    space, isFirst, isLast, busy, members, nameOf, showLocation,
    onRename, onMove, onLocate, onAddManager, onRemoveManager, teams, teamName, onAddTeam, onRemoveTeam, onArchive,
}: SpaceCardProps) {
    const candidates = members.filter((m) => !space.managerUids.includes(m.uid));
    const selectId = `space-manager-${space.id}`;
    const spaceTeams = space.teamIds ?? [];
    const teamCandidates = teams.filter((t) => !spaceTeams.includes(t.id));

    return (
        <li className="glass-card p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                    <h2 className="font-semibold text-surface-900 dark:text-surface-100 break-keep">{space.name}</h2>
                    <p className="text-xs text-surface-500 dark:text-surface-400">
                        {space.managerUids.length === 0 && spaceTeams.length === 0
                            ? '담당자 없음'
                            : [space.managerUids.length > 0 ? `담당자 ${space.managerUids.length}명` : '', spaceTeams.length > 0 ? `담당 팀 ${spaceTeams.length}` : '']
                                .filter(Boolean).join(' · ')}
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
                                className="w-11 h-11 -my-1 flex items-center justify-center rounded-full hover:bg-primary-100 dark:hover:bg-primary-800/50"
                                aria-label={`${nameOf(uid)} 담당자에서 빼기`}>
                                <span aria-hidden="true">✕</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {/* 담당 팀 (2026-11-22) */}
            {spaceTeams.length > 0 && (
                <ul className="flex flex-wrap gap-2 mb-3" aria-label={`${space.name} 담당 팀`}>
                    {spaceTeams.map((id) => (
                        <li key={id} className="inline-flex items-center gap-1 pl-3 pr-1 rounded-full bg-accent-50 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 text-sm">
                            <span aria-hidden="true">👥</span> {teamName(id) ?? '(숨긴 팀)'}
                            <button type="button" onClick={() => onRemoveTeam(id)} disabled={busy}
                                className="w-11 h-11 -my-1 flex items-center justify-center rounded-full hover:bg-accent-100 dark:hover:bg-accent-800/50"
                                aria-label={`${teamName(id) ?? '팀'} 담당 팀에서 빼기`}>
                                <span aria-hidden="true">✕</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {teams.length > 0 && (
                <div className="mb-2">
                    <label htmlFor={`space-team-${space.id}`} className="sr-only">{space.name} 담당 팀 지정</label>
                    <select id={`space-team-${space.id}`} value="" onChange={(e) => onAddTeam(e.target.value)}
                        disabled={busy || teamCandidates.length === 0} className="input w-full min-h-[48px]">
                        <option value="">{teamCandidates.length === 0 ? '지정할 팀이 없습니다' : '+ 담당 팀 지정'}</option>
                        {teamCandidates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
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
                    {showLocation && (
                        <button type="button" onClick={onLocate} disabled={busy} className="btn-secondary min-h-[48px] px-3 flex-1 sm:flex-none"
                            aria-label={`${space.name} 위치 바꾸기`}>
                            위치
                        </button>
                    )}
                    <button type="button" onClick={onArchive} disabled={busy}
                        className="btn-secondary min-h-[48px] px-3 flex-1 sm:flex-none text-amber-700 dark:text-amber-400">
                        숨기기
                    </button>
                </div>
            </div>
        </li>
    );
}
