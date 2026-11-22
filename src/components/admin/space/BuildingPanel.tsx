/**
 * BuildingPanel — 공간 관리의 [건물·층] 탭 (2026-11-22)
 *
 * 건물을 추가하고 이름·주소·층 목록·순서를 고친다. 상태와 저장은 useSpaceManager가 맡는다.
 * 건물이 하나뿐인 기관은 건물을 등록하지 않아도 된다 — 공간은 '건물 미지정'으로 지금처럼 쓴다.
 */
import { useState } from 'react';
import BuildingForm from './BuildingForm';
import PanelModal from './PanelModal';
import { floorLabel, type BuildingInput } from '../../../lib/buildingFloors';
import type { Building } from '../../../types/building';

interface Props {
    busy: boolean;
    activeBuildings: Building[];
    archivedBuildings: Building[];
    spacesIn: (buildingId: string, floor?: string) => unknown[];
    addBuilding: (input: BuildingInput) => Promise<boolean>;
    editBuilding: (building: Building, input: BuildingInput) => Promise<boolean>;
    moveBuilding: (building: Building, direction: -1 | 1) => void;
    archiveBuilding: (building: Building) => void;
    restoreBuilding: (building: Building) => void;
}

export default function BuildingPanel({
    busy, activeBuildings, archivedBuildings, spacesIn,
    addBuilding, editBuilding, moveBuilding, archiveBuilding, restoreBuilding,
}: Props) {
    const [editing, setEditing] = useState<Building | null>(null);
    const [showArchived, setShowArchived] = useState(false);

    return (
        <div>
            <section className="glass-card p-4 mb-6" aria-labelledby="add-building-title">
                <h2 id="add-building-title" className="font-semibold text-surface-900 dark:text-surface-100 mb-3">건물 추가</h2>
                <BuildingForm idPrefix="new-building" submitLabel="건물 추가" busy={busy} onSubmit={addBuilding} resetOnSuccess />
            </section>

            {activeBuildings.length === 0 ? (
                <div className="glass-card p-8 text-center">
                    <div className="text-4xl mb-3" aria-hidden="true">🏫</div>
                    <p className="text-surface-700 dark:text-surface-300 font-medium">아직 등록한 건물이 없습니다</p>
                    <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                        건물이 한 곳뿐이면 등록하지 않아도 됩니다. 본관·별관처럼 여러 곳이면 건물과 층을 등록해 공간을 묶어 보세요.
                    </p>
                </div>
            ) : (
                <ul className="space-y-3" aria-label="건물 목록">
                    {activeBuildings.map((b, i) => {
                        const count = spacesIn(b.id).length;
                        return (
                            <li key={b.id} className="glass-card p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <h3 className="font-semibold text-surface-900 dark:text-surface-100 break-keep">{b.name}</h3>
                                        <p className="text-xs text-surface-500 dark:text-surface-400">
                                            공간 {count}개{b.address ? ` · ${b.address}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button type="button" onClick={() => moveBuilding(b, -1)} disabled={busy || i === 0}
                                            className="btn-icon min-h-[48px] min-w-[48px]" aria-label={`${b.name} 위로`}>
                                            <span aria-hidden="true">▲</span>
                                        </button>
                                        <button type="button" onClick={() => moveBuilding(b, 1)} disabled={busy || i === activeBuildings.length - 1}
                                            className="btn-icon min-h-[48px] min-w-[48px]" aria-label={`${b.name} 아래로`}>
                                            <span aria-hidden="true">▼</span>
                                        </button>
                                    </div>
                                </div>
                                {b.floors.length > 0 ? (
                                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`${b.name} 층`}>
                                        {b.floors.map((f) => {
                                            const n = spacesIn(b.id, f).length;
                                            return (
                                                <li key={f} className="px-2.5 py-1 rounded-full bg-surface-100 dark:bg-surface-800 text-xs text-surface-700 dark:text-surface-300">
                                                    {floorLabel(f)}{n > 0 && <span className="text-surface-500 dark:text-surface-400"> · {n}</span>}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="mt-2 text-xs text-surface-500 dark:text-surface-400">등록된 층이 없습니다</p>
                                )}
                                <div className="mt-3 flex gap-2">
                                    <button type="button" onClick={() => setEditing(b)} disabled={busy} className="btn-secondary min-h-[48px] px-3 flex-1 sm:flex-none">
                                        고치기
                                    </button>
                                    <button type="button" onClick={() => archiveBuilding(b)} disabled={busy}
                                        className="btn-secondary min-h-[48px] px-3 flex-1 sm:flex-none text-amber-700 dark:text-amber-400">
                                        숨기기
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {archivedBuildings.length > 0 && (
                <div className="mt-8">
                    <button type="button" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}
                        className="btn-secondary btn-sm min-h-[44px]">
                        <span aria-hidden="true">{showArchived ? '▾' : '▸'}</span> 숨긴 건물 {archivedBuildings.length}개
                    </button>
                    {showArchived && (
                        <ul className="space-y-2 mt-2" aria-label="숨긴 건물 목록">
                            {archivedBuildings.map((b) => (
                                <li key={b.id} className="glass-card p-4 flex items-center justify-between gap-3">
                                    <span className="text-sm text-surface-500 dark:text-surface-400 truncate">{b.name}</span>
                                    <button type="button" onClick={() => restoreBuilding(b)} disabled={busy}
                                        className="btn-secondary btn-sm min-h-[48px] px-3 flex-shrink-0">
                                        다시 꺼내기
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <PanelModal open={editing !== null} title="건물 고치기" titleId="edit-building-title" onClose={() => setEditing(null)}>
                {editing && (
                    <BuildingForm
                        key={editing.id}
                        idPrefix="edit-building"
                        initial={{ name: editing.name, address: editing.address, floors: editing.floors }}
                        submitLabel="저장"
                        busy={busy}
                        onSubmit={async (input) => {
                            const ok = await editBuilding(editing, input);
                            if (ok) setEditing(null);
                            return ok;
                        }}
                        onCancel={() => setEditing(null)}
                    />
                )}
            </PanelModal>
        </div>
    );
}
