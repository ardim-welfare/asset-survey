/**
 * AssetForm — 재물 한 건 직접 등록·고치기 (관리자, 2026-11-22)
 *
 * /admin/assets/new — 새로 등록(자산코드는 직접 적거나 [자동 번호])
 * /admin/assets/:assetId/edit — 고치기(자산코드는 바꿀 수 없다 — 문서 ID·라벨과 묶여 있다)
 * 상태와 저장은 useAssetForm이 맡는다.
 */
import { type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useAssetForm, { ASSET_LIMITS, type AssetFormValues } from '../../hooks/useAssetForm';
import { groupSpacesByLocation } from '../../lib/spaceGroups';
import { ASSET_STATUS_LABEL } from '../../lib/import/values';
import type { AssetStatus } from '../../types/asset';

const sub = 'text-xs text-surface-500 dark:text-surface-400';
const labelCls = 'block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1';

export default function AssetForm() {
    const { assetId } = useParams<{ assetId: string }>();
    const navigate = useNavigate();
    const f = useAssetForm(assetId);
    const v = f.values;

    if (f.loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 spinner" /></div>;
    if (f.loadError) {
        return (
            <div className="max-w-lg mx-auto glass-card p-6 text-center">
                <p className="text-surface-700 dark:text-surface-300 mb-4">재물 정보를 불러오지 못했습니다.</p>
                <div className="flex justify-center gap-2">
                    <button type="button" className="btn-secondary min-h-[48px] px-4" onClick={() => void f.reload()}>다시 불러오기</button>
                    <Link to="/admin/assets" className="btn-primary min-h-[48px] px-5">목록으로</Link>
                </div>
            </div>
        );
    }

    const detailPath = (id: string) => `/admin/assets/${encodeURIComponent(id)}`;
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const id = await f.save();
        if (id) navigate(detailPath(id));
    };
    const activeSpaces = f.spaces.filter((s) => !s.archived);
    const groups = f.buildings.some((b) => !b.archived) ? groupSpacesByLocation(activeSpaces, f.buildings) : null;

    const text = (key: keyof AssetFormValues & keyof typeof ASSET_LIMITS, label: string, placeholder = '', required = false) => (
        <Field id={`asset-${key}`} label={label} required={required}>
            <input id={`asset-${key}`} type="text" className="input w-full min-h-[48px]" value={v[key]} maxLength={ASSET_LIMITS[key]}
                placeholder={placeholder} onChange={(e) => f.set(key, e.target.value)} />
        </Field>
    );

    return (
        <div className="max-w-2xl mx-auto animate-fade-in">
            <Link to={f.isNew ? '/admin/assets' : detailPath(assetId!)} className="inline-flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 min-h-[44px]">
                <span aria-hidden="true">←</span> {f.isNew ? '재물 목록' : '재물 정보'}
            </Link>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mt-1 mb-2">{f.isNew ? '재물 등록' : '재물 고치기'}</h1>
            <p className="text-sm text-surface-500 dark:text-surface-400 mb-4">
                {f.isNew
                    ? '대장 엑셀에 없는 물건을 한 건씩 등록합니다. 여러 건이면 [재물 가져오기]로 엑셀을 올리는 편이 빠릅니다.'
                    : '고친 내용은 변경 이력에 남습니다.'}
            </p>
            {f.fromLedger && (
                <p className="mb-4 text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
                    대장 엑셀에서 가져온 재물입니다. 여기서 고쳐도 다음에 대장을 다시 가져오면 대장 값으로 바뀝니다. 희망이음·기관 대장도 함께 고쳐 주세요.
                </p>
            )}

            <form onSubmit={handleSubmit} className="glass-card p-5 space-y-4" noValidate>
                {f.isNew ? (
                    <Field id="asset-code" label="자산코드" required hint="라벨에 크게 찍힙니다. 등록한 뒤에는 바꿀 수 없어요.">
                        <div className="flex gap-2">
                            <input id="asset-code" type="text" className="input flex-1 min-h-[48px] font-mono" value={v.code}
                                maxLength={ASSET_LIMITS.code} placeholder="기관 관리번호 (예: A-2024-001)" onChange={(e) => f.set('code', e.target.value)} />
                            <button type="button" className="btn-secondary min-h-[48px] px-3 flex-shrink-0" onClick={f.autoCode}>자동 번호</button>
                        </div>
                    </Field>
                ) : (
                    <div>
                        <p className={labelCls}>자산코드</p>
                        <p className="font-mono text-surface-900 dark:text-surface-100">{v.code}</p>
                    </div>
                )}
                {text('name', '품명', '예: 사무용 책상', true)}

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="asset-space" label="공간">
                        <select id="asset-space" className="input w-full min-h-[48px]" value={v.spaceId} onChange={(e) => f.set('spaceId', e.target.value)}>
                            <option value="">공간 미지정</option>
                            {groups ? groups.filter((g) => g.count > 0).map((g) => (
                                <optgroup key={g.buildingId ?? 'none'} label={g.label}>
                                    {g.floors.flatMap((fl) => fl.spaces.map((s) => (
                                        <option key={s.id} value={s.id}>{g.buildingId && fl.floor ? `${fl.label} ${s.name}` : s.name}</option>
                                    )))}
                                </optgroup>
                            )) : activeSpaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </Field>
                    <Field id="asset-status" label="상태">
                        <select id="asset-status" className="input w-full min-h-[48px]" value={v.status} onChange={(e) => f.set('status', e.target.value as AssetStatus)}>
                            {(Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]).map((s) => <option key={s} value={s}>{ASSET_STATUS_LABEL[s]}</option>)}
                        </select>
                    </Field>
                    {text('category', '분류', '예: 집기')}
                    {text('spec', '규격', '모델명·크기')}
                    <Field id="asset-acquiredAt" label="취득일자">
                        <input id="asset-acquiredAt" type="date" className="input w-full min-h-[48px]" value={v.acquiredAt} onChange={(e) => f.set('acquiredAt', e.target.value)} />
                    </Field>
                    <Field id="asset-quantity" label="현재수량">
                        <input id="asset-quantity" type="number" min={0} inputMode="numeric" className="input w-full min-h-[48px]" value={v.quantity} onChange={(e) => f.set('quantity', e.target.value)} />
                    </Field>
                    <Field id="asset-amount" label="자산금액(원)" hint="관리자만 봅니다.">
                        <input id="asset-amount" type="text" inputMode="numeric" className="input w-full min-h-[48px]" value={v.amount} placeholder="예: 250000" onChange={(e) => f.set('amount', e.target.value)} />
                    </Field>
                    {text('department', '부서')}
                </div>
                {text('usage', '용도', '쓰는 곳·메모')}

                {f.error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{f.error}</p>}

                <div className="flex flex-col sm:flex-row gap-2 justify-end pt-2">
                    {f.isNew && (
                        <button type="button" className="btn-secondary min-h-[48px] px-4" disabled={f.saving} onClick={() => void f.save(true)}>
                            저장하고 하나 더
                        </button>
                    )}
                    <button type="submit" className="btn-primary min-h-[48px] px-5" disabled={f.saving}>
                        {f.saving ? '저장하는 중…' : f.isNew ? '등록' : '저장'}
                    </button>
                </div>
            </form>
        </div>
    );
}

function Field({ id, label, required, hint, children }: { id: string; label: string; required?: boolean; hint?: string; children: ReactNode }) {
    return (
        <div>
            <label htmlFor={id} className={labelCls}>
                {label}{required && <span className="text-red-500" aria-hidden="true"> *</span>}
            </label>
            {children}
            {hint && <p className={`${sub} mt-1`}>{hint}</p>}
        </div>
    );
}
