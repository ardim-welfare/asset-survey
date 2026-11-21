/**
 * SurveyManager — 관리자 재물조사 회차 (기획서 F10)
 *
 * 새 회차 시작(이름·기간·대상 공간 → 대상 목록 고정), 진행 중 회차의 공간별 진행, 지난 회차 목록.
 * 마감·보고서·현황판은 5단계(F13~F16).
 */
import { Link } from 'react-router-dom';
import useSurveyAdmin, { type StartForm } from '../../hooks/useSurveyAdmin';
import { NO_SPACE_KEY } from '../../schemas';
import type { Space } from '../../types/space';
import type { SpaceProgress } from '../../lib/survey/judge';

const sub = 'text-xs text-surface-500 dark:text-surface-400';
const card = 'glass-card p-5 mb-4';
const MODE_LABEL = { delegated: '나눠서 조사', solo: '혼자 조사' } as const;

export default function SurveyManager() {
    const s = useSurveyAdmin();

    if (s.loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 spinner" /></div>;
    if (s.error) {
        return (
            <div className="max-w-3xl mx-auto glass-card p-6 text-center">
                <p className="text-red-600 dark:text-red-400 mb-3">조사 정보를 불러오지 못했습니다.</p>
                <button type="button" className="btn-secondary min-h-[48px] px-4" onClick={() => void s.reload()}>다시 불러오기</button>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-1">재물조사</h1>
            <p className="text-sm text-surface-500 dark:text-surface-400 mb-6">
                조사를 시작하면 그때의 운영 재물이 공간별 대상 목록으로 고정되고, 공간 담당자 화면의 스캔 탭이 열립니다.
            </p>

            {s.open ? (
                <OpenSurvey
                    name={s.open.name} start={s.open.startDate} end={s.open.endDate} mode={s.open.mode}
                    spaces={s.spaces} spaceIds={s.open.spaceIds} includesUnassigned={s.open.includesUnassigned}
                    progress={s.progress} totals={s.totals} onRefresh={() => void s.refreshProgress()}
                />
            ) : s.form ? (
                <StartFormView
                    form={s.form} setForm={s.setForm} spaces={s.spaces} preview={s.preview} error={s.formError}
                    mode={s.mode} starting={s.starting} onStart={() => void s.start()} onCancel={s.closeForm}
                />
            ) : (
                <section className={`${card} text-center`}>
                    <p className="text-surface-700 dark:text-surface-300 font-medium mb-1">진행 중인 조사가 없습니다</p>
                    <p className={`${sub} mb-4`}>조사 방식: {MODE_LABEL[s.mode]} (설정에서 바꿀 수 있습니다)</p>
                    <button type="button" className="btn-primary min-h-[48px] px-5" onClick={() => void s.openForm()}
                        disabled={s.spaces.filter((x) => !x.archived).length === 0}>새 조사 시작</button>
                    {s.spaces.length === 0 && (
                        <p className={`${sub} mt-3`}>먼저 <Link to="/admin/spaces" className="underline">공간</Link>을 만들고 <Link to="/admin/import" className="underline">재물을 가져오세요</Link>.</p>
                    )}
                </section>
            )}

            {s.surveys.filter((x) => x.status === 'closed').length > 0 && (
                <section className={card}>
                    <h2 className="font-semibold text-surface-900 dark:text-surface-100 mb-2">지난 조사</h2>
                    <ul className="divide-y divide-surface-100 dark:divide-surface-700">
                        {s.surveys.filter((x) => x.status === 'closed').map((x) => (
                            <li key={x.id} className="py-2 text-sm text-surface-800 dark:text-surface-200">
                                {x.name} <span className={sub}>{x.startDate} ~ {x.endDate} · 대상 {x.targetCount}건</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

interface StartFormProps {
    form: StartForm;
    setForm: (f: StartForm) => void;
    spaces: Space[];
    preview: { count: (key: string) => number; total: number; unassigned: number } | null;
    error: string | null;
    mode: 'delegated' | 'solo';
    starting: boolean;
    onStart: () => void;
    onCancel: () => void;
}

function StartFormView({ form, setForm, spaces, preview, error, mode, starting, onStart, onCancel }: StartFormProps) {
    const active = spaces.filter((x) => !x.archived).sort((a, b) => a.order - b.order);
    const toggle = (id: string) => setForm({
        ...form, spaceIds: form.spaceIds.includes(id) ? form.spaceIds.filter((x) => x !== id) : [...form.spaceIds, id],
    });
    const noManager = active.filter((x) => form.spaceIds.includes(x.id) && x.managerUids.length === 0);
    return (
        <section className={card} aria-labelledby="start-title">
            <h2 id="start-title" className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-3">새 조사 시작</h2>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2 text-sm text-surface-700 dark:text-surface-300">
                    회차 이름
                    <input className="input min-h-[48px] mt-1" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <label className="text-sm text-surface-700 dark:text-surface-300">
                    시작
                    <input type="date" className="input min-h-[48px] mt-1" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </label>
                <label className="text-sm text-surface-700 dark:text-surface-300">
                    끝
                    <input type="date" className="input min-h-[48px] mt-1" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </label>
            </div>

            <fieldset className="mt-4">
                <legend className="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-1">대상 공간 <span className={`${sub} font-normal`}>(운영 재물만 대상)</span></legend>
                <ul className="divide-y divide-surface-100 dark:divide-surface-700">
                    {active.map((x) => (
                        <li key={x.id}>
                            <label className="flex items-center gap-3 min-h-[44px] text-sm text-surface-800 dark:text-surface-200">
                                <input type="checkbox" className="w-4 h-4" checked={form.spaceIds.includes(x.id)} onChange={() => toggle(x.id)} />
                                <span className="flex-1">{x.name}</span>
                                <span className={sub}>{preview?.count(x.id) ?? 0}건 · 담당 {x.managerUids.length}명</span>
                            </label>
                        </li>
                    ))}
                    {(preview?.unassigned ?? 0) > 0 && (
                        <li>
                            <label className="flex items-center gap-3 min-h-[44px] text-sm text-surface-800 dark:text-surface-200">
                                <input type="checkbox" className="w-4 h-4" checked={form.includesUnassigned} onChange={(e) => setForm({ ...form, includesUnassigned: e.target.checked })} />
                                <span className="flex-1">공간 미지정 재물</span>
                                <span className={sub}>{preview?.unassigned}건 · 어디서 찍든 '다른 공간'으로 나옴</span>
                            </label>
                        </li>
                    )}
                </ul>
            </fieldset>

            {mode === 'delegated' && noManager.length > 0 && (
                <p className="mt-3 text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
                    담당자가 없는 공간이 있습니다({noManager.map((x) => x.name).join(', ')}). 그 공간은 관리자만 찍을 수 있습니다.
                </p>
            )}
            {mode === 'solo' && <p className={`${sub} mt-3`}>조사 방식이 '혼자 조사'라 관리자만 찍습니다.</p>}
            {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}

            <div className="flex flex-col sm:flex-row gap-2 justify-end mt-4">
                <button type="button" className="btn-secondary min-h-[48px] px-4" onClick={onCancel} disabled={starting}>취소</button>
                <button type="button" className="btn-primary min-h-[48px] px-5" onClick={onStart} disabled={!!error || starting || !preview || preview.total === 0}>
                    {starting ? '시작하는 중…' : `대상 ${(preview?.total ?? 0).toLocaleString('ko-KR')}건으로 시작`}
                </button>
            </div>
        </section>
    );
}

interface OpenSurveyProps {
    name: string; start: string; end: string; mode: 'delegated' | 'solo';
    spaces: Space[]; spaceIds: string[]; includesUnassigned: boolean;
    progress: Map<string, SpaceProgress>;
    totals: { target: number; found: number; unregistered: number };
    onRefresh: () => void;
}

function OpenSurvey({ name, start, end, mode, spaces, spaceIds, includesUnassigned, progress, totals, onRefresh }: OpenSurveyProps) {
    const rows = [
        ...spaces.filter((x) => spaceIds.includes(x.id)).sort((a, b) => a.order - b.order).map((x) => ({ key: x.id, name: x.name })),
        ...(includesUnassigned ? [{ key: NO_SPACE_KEY, name: '공간 미지정' }] : []),
    ];
    const pct = totals.target > 0 ? Math.round((totals.found / totals.target) * 100) : 0;
    return (
        <section className={card} aria-labelledby="open-title">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 id="open-title" className="text-lg font-semibold text-surface-900 dark:text-surface-100">{name}</h2>
                    <p className={sub}>{start} ~ {end} · {MODE_LABEL[mode]}</p>
                </div>
                <div className="flex gap-2">
                    <button type="button" className="btn-secondary btn-sm min-h-[44px] px-3" onClick={onRefresh}>새로고침</button>
                    <Link to="/employee/scan" className="btn-primary btn-sm min-h-[44px] px-4">직접 스캔</Link>
                </div>
            </div>
            <p className="mt-3 text-sm text-surface-800 dark:text-surface-200">
                전체 <strong>{totals.found.toLocaleString('ko-KR')}</strong> / {totals.target.toLocaleString('ko-KR')}건 확인 ({pct}%)
                {totals.unregistered > 0 && <span className="text-red-700 dark:text-red-300"> · 미등록 {totals.unregistered}건</span>}
            </p>
            <div className="overflow-x-auto mt-3">
                <table className="w-full text-sm">
                    <thead className="text-left text-surface-500 dark:text-surface-400 border-b border-surface-100 dark:border-surface-700">
                        <tr>
                            <th className="py-2 pr-3 font-medium">공간</th>
                            <th className="py-2 pr-3 font-medium">확인</th>
                            <th className="py-2 pr-3 font-medium">다른 곳에서 찾음</th>
                            <th className="py-2 pr-3 font-medium">여기서 나온 예외</th>
                            <th className="py-2 pr-3 font-medium">직접 입력</th>
                            <th className="py-2 font-medium">상태 이상</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
                        {rows.map((r) => {
                            const p = progress.get(r.key);
                            return (
                                <tr key={r.key}>
                                    <td className="py-2 pr-3 text-surface-900 dark:text-surface-100">{r.name}</td>
                                    <td className="py-2 pr-3 whitespace-nowrap">{p?.found ?? 0} / {p?.target ?? 0}</td>
                                    <td className="py-2 pr-3">{p?.elsewhere ?? 0}</td>
                                    <td className="py-2 pr-3">{p?.foreign ?? 0}</td>
                                    <td className="py-2 pr-3">{p?.manual ?? 0}</td>
                                    <td className="py-2">{p?.issues ?? 0}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className={`${sub} mt-3`}>마감·결과 보고서는 다음 단계에서 열립니다.</p>
        </section>
    );
}
