/**
 * useAssetForm — 재물 한 건 직접 등록·수정 (관리자, 2026-11-22)
 *
 * 대장 엑셀이 없거나, 엑셀에 없는 물건을 하나만 더할 때 쓴다. 저장은 lib/firestore/assets.ts가
 * 재물·금액·이력을 한 배치로 쓴다. 대장에서 온 재물을 고치면 다음 가져오기 때 대장 값으로 다시 바뀐다
 * (화면이 안내한다).
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { useToast } from './useToast';
import {
    getAsset, getAssets, getAssetAccounting, getSpaces, getBuildings,
    createAssetManually, updateAssetManually, nextAssetCode, AssetCodeTakenError, uploadAssetPhoto, getTeams,
    type ManualAssetFields,
} from '../lib/firestore';
import type { Asset, AssetAccounting, AssetStatus } from '../types/asset';
import type { Space } from '../types/space';
import type { Building } from '../types/building';

/** 입력 칸 — 숫자도 글자로 받아 저장할 때 바꾼다(빈 칸 = 없음) */
export interface AssetFormValues {
    code: string;
    name: string;
    category: string;
    spec: string;
    acquiredAt: string;
    quantity: string;
    status: AssetStatus;
    spaceId: string;
    department: string;
    usage: string;
    amount: string;
}

export const EMPTY_ASSET_FORM: AssetFormValues = {
    code: '', name: '', category: '', spec: '', acquiredAt: '', quantity: '1', status: 'active',
    spaceId: '', department: '', usage: '', amount: '',
};

/** 길이 상한 — firestore.rules assetDataValid와 같은 값 */
export const ASSET_LIMITS = { code: 100, name: 200, category: 100, spec: 200, department: 100, usage: 500 } as const;

const toNumber = (s: string): number | null => {
    const t = s.replace(/[,\s원]/g, '');
    return t === '' ? null : Number(t);
};

/** 금액 칸 글자 — 숫자만 남겨 천 단위 쉼표를 붙인다("250000" → "250,000"). 저장 때는 toNumber가 쉼표를 뗀다 */
export function formatAmountInput(raw: string): string {
    const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
    return digits === '' ? '' : Number(digits).toLocaleString('ko-KR');
}

/** 입력 검사 — 문제가 있으면 안내 문구 */
export function validateAssetForm(v: AssetFormValues, isNew: boolean): string | null {
    if (isNew && !v.code.trim()) return '자산코드를 넣어 주세요. 번호가 없으면 [자동 번호]를 누르세요.';
    if (isNew && /[/\\#?%]/.test(v.code)) return '자산코드에는 / \\ # ? % 를 쓸 수 없습니다.';
    if (!v.name.trim()) return '품명을 넣어 주세요.';
    for (const [k, max] of Object.entries(ASSET_LIMITS) as Array<[keyof typeof ASSET_LIMITS, number]>) {
        if (v[k].trim().length > max) return `글자가 너무 깁니다(${max}자까지).`;
    }
    if (v.acquiredAt && !/^\d{4}-\d{2}-\d{2}$/.test(v.acquiredAt)) return '취득일자는 2024-03-15처럼 넣어 주세요.';
    const q = toNumber(v.quantity);
    if (q !== null && (!Number.isInteger(q) || q < 0)) return '수량은 0 이상의 정수로 넣어 주세요.';
    const a = toNumber(v.amount);
    if (a !== null && (!Number.isFinite(a) || a < 0)) return '자산금액은 숫자(원)로 넣어 주세요.';
    return null;
}

/** 입력값 → 저장할 값 */
export function toManualFields(v: AssetFormValues): { fields: ManualAssetFields; amount: number | null } {
    const t = (s: string) => (s.trim() === '' ? null : s.trim());
    return {
        fields: {
            name: t(v.name), category: t(v.category), spec: t(v.spec), acquiredAt: t(v.acquiredAt),
            quantity: toNumber(v.quantity), status: v.status, spaceId: v.spaceId || null,
            department: t(v.department), usage: t(v.usage),
        },
        amount: toNumber(v.amount),
    };
}

function fromAsset(a: Asset, acc: AssetAccounting | null): AssetFormValues {
    const s = (x: string | null) => x ?? '';
    return {
        code: a.code, name: s(a.name), category: s(a.category), spec: s(a.spec), acquiredAt: s(a.acquiredAt),
        quantity: a.quantity == null ? '' : String(a.quantity), status: a.status, spaceId: a.spaceId ?? '',
        department: s(a.department), usage: s(a.usage), amount: acc?.amount == null ? '' : formatAmountInput(String(acc.amount)),
    };
}

export default function useAssetForm(assetId: string | undefined) {
    const { userData } = useAuth();
    const { showToast } = useToast();
    const orgId = userData?.organizationId ?? null;
    const isNew = !assetId;
    const [values, setValues] = useState<AssetFormValues>(EMPTY_ASSET_FORM);
    const [asset, setAsset] = useState<Asset | null>(null);
    const [accounting, setAccounting] = useState<AssetAccounting | null>(null);
    const [codes, setCodes] = useState<string[]>([]);
    /** 부서 고르기 목록(2026-11-22) — 팀 이름 + 이미 재물에 쓰인 부서 이름, 가나다순 */
    const [departments, setDepartments] = useState<string[]>([]);
    const [teamList, setTeamList] = useState<Array<{ id: string; name: string }>>([]);
    /** 공간을 골라 자동으로 채운 부서 값 — 사람이 바꾸지 않았으면 공간을 바꿀 때 다시 채운다 */
    const [autoDepartment, setAutoDepartment] = useState<string | null>(null);
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [buildings, setBuildings] = useState<Building[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    /** 새로 등록할 때 함께 올릴 사진(선택, 2026-11-22) — 고칠 때는 재물 화면에서 바꾼다 */
    const [photo, setPhoto] = useState<File | null>(null);

    const load = useCallback(async () => {
        if (!orgId) { setLoading(false); return; }
        setLoading(true);
        setLoadError(false);
        try {
            const [sp, bd, all, teams] = await Promise.all([
                getSpaces(orgId), getBuildings(orgId), getAssets(orgId),
                getTeams(orgId).catch(() => []),
            ]);
            setSpaces(sp);
            setBuildings(bd);
            // 자동 번호·겹침 확인용 코드 목록과 부서 고르기 목록
            setCodes(all.map((a) => a.code));
            const names = new Set<string>([
                ...teams.filter((t) => !t.archived).map((t) => t.name),
                ...all.map((a) => a.department?.trim() ?? '').filter(Boolean),
            ]);
            setDepartments([...names].sort((a, b) => a.localeCompare(b, 'ko')));
            setTeamList(teams.map((t) => ({ id: t.id, name: t.name })));
            if (assetId) {
                const found = await getAsset(assetId);
                if (!found || found.organizationId !== orgId) { setLoadError(true); return; }
                const acc = await getAssetAccounting(assetId);
                setAsset(found);
                setAccounting(acc);
                setValues(fromAsset(found, acc));
            }
        } catch {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [orgId, assetId]);

    useEffect(() => { void load(); }, [load]);

    const set = useCallback(<K extends keyof AssetFormValues>(key: K, value: AssetFormValues[K]) => {
        setValues((prev) => ({ ...prev, [key]: value }));
        setError('');
    }, []);

    const autoCode = useCallback(() => set('code', nextAssetCode(codes)), [codes, set]);

    /**
     * 공간 고르기(2026-11-22, 사용자 의견) — 공간에 담당 팀이 있으면 그 팀 이름으로 부서를 채운다.
     * 부서를 사람이 직접 바꿨으면(자동 값과 다르면) 건드리지 않는다.
     */
    const chooseSpace = useCallback((spaceId: string) => {
        const space = spaces.find((s) => s.id === spaceId);
        const teamName = teamList.find((t) => t.id === (space?.teamIds ?? [])[0])?.name ?? null;
        setValues((prev) => {
            const untouched = prev.department === '' || prev.department === autoDepartment;
            return { ...prev, spaceId, department: untouched && teamName ? teamName : prev.department };
        });
        setAutoDepartment(teamName);
        setError('');
    }, [spaces, teamList, autoDepartment]);

    /**
     * 저장 — 성공하면 재물 문서 ID. `keepGoing`이면(새로 등록 + '저장하고 하나 더') 입력을 비우되
     * 공간·분류·상태는 남겨 같은 방 물건을 이어서 넣기 쉽게 한다.
     */
    const save = useCallback(async (keepGoing = false): Promise<string | null> => {
        if (!orgId || saving) return null;
        const problem = validateAssetForm(values, isNew);
        if (problem) { setError(problem); return null; }
        const code = values.code.trim();
        if (isNew && codes.includes(code)) { setError(`같은 자산코드(${code})의 재물이 이미 있습니다.`); return null; }
        const { fields, amount } = toManualFields(values);
        setSaving(true);
        try {
            if (isNew) {
                const id = await createAssetManually({ orgId, code, fields, amount });
                setCodes((prev) => [...prev, code]);
                showToast(`'${fields.name}'을(를) 등록했습니다.`, 'success');
                if (photo) {
                    // 사진은 등록 뒤에 올린다 — 실패해도 재물은 등록됐으니 재물 화면에서 다시 올리게 안내한다
                    try {
                        await uploadAssetPhoto({ id, organizationId: orgId, code }, photo);
                    } catch {
                        showToast('사진은 올리지 못했습니다. 재물 화면에서 다시 올려 주세요.', 'warning');
                    }
                    setPhoto(null);
                }
                if (keepGoing) setValues((prev) => ({ ...EMPTY_ASSET_FORM, spaceId: prev.spaceId, category: prev.category, status: prev.status }));
                return id;
            }
            if (!asset) return null;
            const n = await updateAssetManually({ asset, fields, amount, accounting });
            showToast(n > 0 ? '재물 정보를 고쳤습니다.' : '바뀐 내용이 없습니다.', n > 0 ? 'success' : 'info');
            return asset.id;
        } catch (e) {
            setError(e instanceof AssetCodeTakenError
                ? `같은 자산코드(${code})의 재물이 이미 있습니다.`
                : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
            return null;
        } finally {
            setSaving(false);
        }
    }, [orgId, saving, values, isNew, codes, asset, accounting, photo, showToast]);

    return {
        isNew, values, set, autoCode, chooseSpace, save, saving, error, photo, setPhoto, departments,
        /** 지금 부서 값이 공간의 담당 팀에서 자동으로 채운 것인가 */
        departmentFromSpace: autoDepartment !== null && values.department === autoDepartment,
        asset, spaces, buildings, loading, loadError, reload: load,
        /** 대장에서 온 재물 — 고쳐도 다음 가져오기 때 대장 값으로 바뀐다 */
        fromLedger: !!asset && !asset.manual,
    };
}
