/**
 * SurveyReport — 재물조사 결과 보고서 (기획서 F15) · 희망이음 반영 목록 (F16) · 조사 이력 (F17)
 *
 * 마감한 회차는 보고서·반영 목록을, 진행 중 회차는 중간 보고서만 보여 준다.
 * PDF(인쇄)·엑셀로 내려받는다. 금액은 담지 않는다.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import useSurveyReport from '../../hooks/useSurveyReport';
import { buildReportTables, reportHeader, reportPhotos, PHOTO_TABLE_TITLE } from '../../lib/survey/reportTables';
import { SYNC_KIND_LABEL } from '../../lib/survey/report';
import { toDateOrNull } from '../../lib/dateUtils';
import type { SyncTask, SyncTaskKind, SurveyEvent } from '../../types/survey';

const sub = 'text-xs text-surface-500 dark:text-surface-400';
const card = 'glass-card p-5 mb-4';
const KIND_ORDER: SyncTaskKind[] = ['move', 'dispose', 'missing', 'register', 'relabel'];
const KIND_HELP: Record<SyncTaskKind, string> = {
    move: '희망이음에서 위치를 찾은 공간으로 바꿉니다.',
    dispose: '파손된 재물 — 불용 처리 여부를 검토합니다.',
    missing: '끝내 찾지 못한 재물 — 다시 찾아보고 분실·폐기 절차를 검토합니다.',
    register: '목록에 없는 라벨·코드 — 희망이음 등록 여부를 확인합니다.',
    relabel: '라벨을 다시 뽑아 붙입니다(앱의 재물 상세에서 다시 인쇄).',
};
const EVENT_LABEL: Record<SurveyEvent['type'], string> = {
    start: '조사 시작', submit: '공간 제출', approve: '승인', reject: '반려', close: '마감',
    'sync-done': '반영 완료 표시', 'sync-undone': '반영 완료 해제',
};

function when(ts: unknown): string {
    const d = toDateOrNull((ts ?? null) as Parameters<typeof toDateOrNull>[0]);
    if (!d) return '-';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function SurveyReport() {
    const { surveyId } = useParams<{ surveyId: string }>();
    const r = useSurveyReport(surveyId);
    const [showLog, setShowLog] = useState(false);

    if (r.loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 spinner" /></div>;
    if (r.notFound || r.error || !r.ctx || !r.survey) {
        return (
            <div className="max-w-3xl mx-auto glass-card p-6 text-center">
                <p className="text-surface-700 dark:text-surface-300 mb-4">{r.notFound ? '이 기관에 없는 조사입니다.' : '보고서를 불러오지 못했습니다.'}</p>
                <Link to="/admin/surveys" className="btn-primary min-h-[48px] px-5">재물조사로</Link>
            </div>
        );
    }

    const ctx = r.ctx;
    // 현장 사진은 주소 표 대신 사진으로 보여 준다(2026-11-22)
    const tables = buildReportTables(ctx).filter((t) => t.title !== PHOTO_TABLE_TITLE);
    const photos = reportPhotos(ctx);
    const closed = r.survey.status === 'closed';
    const doneCount = r.tasks.filter((t) => t.done).length;

    return (
        <div className="max-w-5xl mx-auto animate-fade-in">
            <Link to="/admin/surveys" className="inline-flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 min-h-[44px]">
                <span aria-hidden="true">←</span> 재물조사
            </Link>
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">{closed ? '결과 보고서' : '중간 보고서'}</h1>
                    <p className="text-sm text-surface-500 dark:text-surface-400">{reportHeader(ctx).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>
                </div>
                <div className="flex gap-2">
                    <button type="button" className="btn-secondary min-h-[48px] px-4" onClick={r.printPdf}>PDF(인쇄)</button>
                    <button type="button" className="btn-primary min-h-[48px] px-4" onClick={() => void r.downloadExcel()}>엑셀 내려받기</button>
                </div>
            </div>
            {!closed && (
                <p className="mb-4 text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
                    아직 진행 중인 조사입니다. 지금까지 찍은 것으로 계산했고, 마감하면 희망이음 반영 목록이 만들어집니다.
                </p>
            )}

            {closed && (
                <section className={card} aria-labelledby="sync-title">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                        <h2 id="sync-title" className="text-lg font-semibold text-surface-900 dark:text-surface-100">희망이음 반영 목록</h2>
                        <span className="text-sm text-surface-700 dark:text-surface-300">{doneCount} / {r.tasks.length} 처리</span>
                    </div>
                    <p className={`${sub} mb-3`}>조사로 드러난 것 중 희망이음에 옮겨 적을 일입니다. 희망이음에서 처리한 뒤 체크하세요. 앱이 희망이음을 직접 고치지는 않습니다.</p>
                    {r.tasks.length === 0 ? (
                        <p className="text-sm text-surface-600 dark:text-surface-300">옮겨 적을 일이 없습니다. 🎉</p>
                    ) : KIND_ORDER.map((kind) => {
                        const list = r.tasks.filter((t) => t.kind === kind).sort((a, b) => a.code.localeCompare(b.code, 'ko', { numeric: true }));
                        if (list.length === 0) return null;
                        return (
                            <div key={kind} className="mb-4">
                                <h3 className="font-medium text-surface-900 dark:text-surface-100">{SYNC_KIND_LABEL[kind]} <span className={sub}>{list.length}건 · {KIND_HELP[kind]}</span></h3>
                                <ul className="mt-1 divide-y divide-surface-100 dark:divide-surface-700">
                                    {list.map((t) => <TaskRow key={t.id} task={t} spaceName={ctx.spaceName} onToggle={() => void r.toggleTask(t)} />)}
                                </ul>
                            </div>
                        );
                    })}
                </section>
            )}

            {tables.map((t) => (
                <section key={t.title} className={card}>
                    <h2 className="font-semibold text-surface-900 dark:text-surface-100 mb-2">
                        {t.title}{t.title !== '종합' && t.rows.length > 0 && <span className={`${sub} font-normal`}> {t.rows.length}건</span>}
                    </h2>
                    {t.rows.length === 0 ? <p className="text-sm text-surface-600 dark:text-surface-300">{t.empty}</p> : (
                        <>
                        {/* 휴대폰에서 칸이 많은 표는 옆으로 민다 — 첫 칸은 붙잡아 두고, 밀 수 있다고 알린다(2026-11-22 점검) */}
                        {t.columns.length > 4 && <p className={`${sub} sm:hidden mb-1`}>← 표를 옆으로 밀어 보세요</p>}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-left text-surface-600 dark:text-surface-400 border-b border-surface-100 dark:border-surface-700">
                                    <tr>{t.columns.map((c, j) => <th key={c} className={`py-2 pr-3 font-medium whitespace-nowrap ${j === 0 ? 'sticky left-0 bg-white dark:bg-surface-800' : ''}`}>{c}</th>)}</tr>
                                </thead>
                                <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
                                    {t.rows.map((row, i) => (
                                        <tr key={i}>{row.map((v, j) => <td key={j} className={`py-2 pr-3 text-surface-800 dark:text-surface-200 ${typeof v === 'number' ? 'text-right tabular-nums' : ''} ${j === 0 ? 'sticky left-0 bg-white dark:bg-surface-800' : ''}`}>{typeof v === 'number' ? v.toLocaleString('ko-KR') : v}</td>)}</tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        </>
                    )}
                </section>
            ))}

            {photos.length > 0 && (
                <section className={card} aria-labelledby="photo-title">
                    <h2 id="photo-title" className="font-semibold text-surface-900 dark:text-surface-100 mb-2">
                        {PHOTO_TABLE_TITLE} <span className={`${sub} font-normal`}>{photos.length}건</span>
                    </h2>
                    <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {photos.map((p) => (
                            <li key={p.url}>
                                <a href={p.url} target="_blank" rel="noopener noreferrer" className="block">
                                    <img src={p.thumbUrl} alt={`${p.code} 현장 사진`} loading="lazy" className="w-full aspect-square object-cover rounded-lg bg-surface-100 dark:bg-surface-800" />
                                </a>
                                <p className="text-xs text-surface-700 dark:text-surface-300 mt-1"><b className="font-mono">{p.code}</b> {p.name}</p>
                                <p className={sub}>{p.where} · {p.condition}{p.memo ? ` · ${p.memo}` : ''}</p>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section className={card}>
                <button type="button" className="btn-secondary btn-sm min-h-[44px] font-semibold" aria-expanded={showLog} onClick={() => setShowLog((v) => !v)}>
                    <span aria-hidden="true">{showLog ? '▾' : '▸'}</span> 조사 이력 {r.events.length}건
                </button>
                {showLog && (
                    <ol className="mt-2 space-y-1 text-sm">
                        {r.events.map((e) => (
                            <li key={e.id} className="text-surface-700 dark:text-surface-300">
                                <span className={sub}>{when(e.at)}</span> · {EVENT_LABEL[e.type]}
                                {e.spaceId && ` · ${ctx.spaceName(e.spaceId)}`} · {ctx.personName(e.byUid)}
                                {e.reason && <span className="text-surface-500 dark:text-surface-400"> — {e.reason}</span>}
                            </li>
                        ))}
                    </ol>
                )}
            </section>
        </div>
    );
}

function TaskRow({ task, spaceName, onToggle }: { task: SyncTask; spaceName: (key: string | null) => string; onToggle: () => void }) {
    const where = task.kind === 'move'
        ? `${spaceName(task.fromSpaceId)} → ${spaceName(task.toSpaceId)}`
        : task.kind === 'missing' ? `목록상 ${spaceName(task.fromSpaceId)}` : spaceName(task.toSpaceId);
    return (
        <li>
            <label className="flex items-start gap-3 py-2 min-h-[44px] text-sm cursor-pointer">
                <input type="checkbox" className="w-5 h-5 mt-0.5 flex-shrink-0" checked={task.done} onChange={onToggle} />
                <span className={task.done ? 'line-through text-surface-500 dark:text-surface-400' : 'text-surface-800 dark:text-surface-200'}>
                    <span className="font-mono">{task.code}</span> {task.name ?? ''}
                    <span className="block text-xs text-surface-500 dark:text-surface-400">{where}{task.memo ? ` · ${task.memo}` : ''}</span>
                </span>
            </label>
        </li>
    );
}
