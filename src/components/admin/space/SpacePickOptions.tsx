/**
 * SpacePickOptions — 공간 고르기 칸의 선택지(건물·층으로 묶음) (2026-11-23)
 * 재물 공간 옮기기·공간 미지정 정리가 함께 쓴다. 건물이 없으면 이름만 늘어놓는다.
 */
import { groupSpacesByLocation } from '../../../lib/spaceGroups';
import type { Space } from '../../../types/space';
import type { Building } from '../../../types/building';

export default function SpacePickOptions({ spaces, buildings }: { spaces: Space[]; buildings: Building[] }) {
    const active = spaces.filter((s) => !s.archived);
    if (!buildings.some((b) => !b.archived)) {
        return <>{active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</>;
    }
    return (
        <>
            {groupSpacesByLocation(active, buildings).filter((g) => g.count > 0).map((g) => (
                <optgroup key={g.buildingId ?? 'none'} label={g.label}>
                    {g.floors.flatMap((f) => f.spaces.map((s) => (
                        <option key={s.id} value={s.id}>{g.buildingId ? `${g.label}${f.floor ? ` ${f.label}` : ''} ${s.name}` : s.name}</option>
                    )))}
                </optgroup>
            ))}
        </>
    );
}
