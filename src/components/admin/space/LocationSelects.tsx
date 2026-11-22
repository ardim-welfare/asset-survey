/**
 * LocationSelects — 공간의 건물·층 고르기 (공간 추가 칸과 위치 바꾸기 창이 함께 쓴다)
 *
 * 건물을 바꾸면 층은 비운다(다른 건물의 층 이름이 남지 않게). 건물을 고르지 않으면 층 칸은 잠근다.
 */
import { floorLabel } from '../../../lib/buildingFloors';
import type { Building } from '../../../types/building';
import type { SpaceLocation } from '../../../lib/firestore/spaces';

interface Props {
    idPrefix: string;
    buildings: Building[];
    value: SpaceLocation;
    onChange: (next: SpaceLocation) => void;
    disabled?: boolean;
}

export default function LocationSelects({ idPrefix, buildings, value, onChange, disabled }: Props) {
    const building = buildings.find((b) => b.id === value.buildingId);
    const floors = building?.floors ?? [];

    return (
        <div className="flex gap-2">
            <label htmlFor={`${idPrefix}-building`} className="sr-only">건물</label>
            <select
                id={`${idPrefix}-building`}
                value={value.buildingId ?? ''}
                onChange={(e) => onChange({ buildingId: e.target.value || null, floor: null })}
                disabled={disabled}
                className="input flex-1 min-h-[48px]"
            >
                <option value="">건물 미지정</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <label htmlFor={`${idPrefix}-floor`} className="sr-only">층</label>
            <select
                id={`${idPrefix}-floor`}
                value={value.floor ?? ''}
                onChange={(e) => onChange({ buildingId: value.buildingId, floor: e.target.value || null })}
                disabled={disabled || !building || floors.length === 0}
                className="input flex-1 min-h-[48px]"
            >
                <option value="">{building && floors.length === 0 ? '등록된 층 없음' : '층 미지정'}</option>
                {floors.map((f) => <option key={f} value={f}>{floorLabel(f)}</option>)}
            </select>
        </div>
    );
}
