/**
 * WithdrawOrgModal — 기관 서비스 해지(자발적 탈퇴) 모달
 * 사유 선택 + (기타 시 상세) + 기관명 확인 입력 후 해지 진행
 */
import { useState } from 'react';
import { WITHDRAW_REASON_LABELS } from '../../types/organization';
import type { WithdrawReason } from '../../types/organization';
import PanelModal from './space/PanelModal';

interface WithdrawOrgModalProps {
    orgName: string;
    submitting: boolean;
    onClose: () => void;
    onConfirm: (reason: WithdrawReason, reasonDetail?: string) => void;
}

const REASON_ORDER: WithdrawReason[] = ['no_longer_needed', 'too_difficult', 'missing_features', 'other'];

export default function WithdrawOrgModal({ orgName, submitting, onClose, onConfirm }: WithdrawOrgModalProps) {
    const [reason, setReason] = useState<WithdrawReason | null>(null);
    const [detail, setDetail] = useState('');
    const [confirmName, setConfirmName] = useState('');

    const nameMatches = confirmName.trim() === orgName.trim();
    const detailRequired = reason === 'other';
    const detailValid = !detailRequired || detail.trim().length > 0;
    const canSubmit = !!reason && nameMatches && detailValid && !submitting;

    const handleSubmit = () => {
        if (!canSubmit || !reason) return;
        onConfirm(reason, reason === 'other' ? detail.trim() : undefined);
    };

    // 아직 못 누르는 이유를 글로 보여 준다 — 흐린 버튼만 있으면 무엇이 빠졌는지 알 수 없다
    const missing = [
        !reason && '해지 사유 고르기',
        detailRequired && !detailValid && '기타 사유 적기',
        !nameMatches && '기관명 똑같이 입력하기',
    ].filter(Boolean).join(', ');
    // 해지하는 중에는 닫지 않는다 — 닫혀도 해지는 계속되어 결과를 알 수 없게 된다
    const close = () => { if (!submitting) onClose(); };

    // 예전 바깥 칸은 div role="button"이었고 창에는 대화상자 역할·Esc 닫기가 없었다 — 공용 대화상자 껍데기로 바꿨다
    return (
        <PanelModal open title="서비스 해지" titleId="withdraw-org-title" onClose={close}>
            <div className="space-y-5">
                {/* 경고 안내 */}
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300 space-y-1">
                    <p className="font-semibold">정말 서비스를 해지하시겠습니까?</p>
                    <ul className="list-disc pl-4 text-sm space-y-1">
                        <li>모든 직원의 접근이 즉시 차단됩니다.</li>
                        <li>해지 후 30일간 데이터를 보관하며, 복구는 운영자(슈퍼관리자)에게 문의해야 합니다.</li>
                        <li>30일이 지나면 데이터가 영구 삭제됩니다. (법령상 의무인 접속기록은 1년, 장애 복구용 백업은 최대 90일 뒤 자동 파기)</li>
                    </ul>
                </div>

                {/* 사유 선택 — 라디오 묶음은 fieldset·legend로 이름을 준다 */}
                <fieldset>
                    <legend className="label">해지 사유 <span className="text-red-700 dark:text-red-300" aria-hidden="true">*</span></legend>
                    <div className="space-y-2">
                        {REASON_ORDER.map((r) => (
                            <label
                                key={r}
                                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors min-h-[48px]
                                    ${reason === r
                                        ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
                                        : 'border-surface-200 dark:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-700'}`}
                            >
                                <input
                                    type="radio"
                                    name="withdrawReason"
                                    value={r}
                                    checked={reason === r}
                                    onChange={() => setReason(r)}
                                    className="w-5 h-5 flex-shrink-0 accent-red-600"
                                />
                                <span className="text-sm text-surface-800 dark:text-surface-100">{WITHDRAW_REASON_LABELS[r]}</span>
                            </label>
                        ))}
                    </div>
                    {reason === 'other' && (
                        <>
                            <label htmlFor="withdraw-detail" className="sr-only">기타 해지 사유</label>
                            <textarea
                                id="withdraw-detail"
                                value={detail}
                                onChange={e => setDetail(e.target.value)}
                                className="input min-h-[80px] resize-y mt-2"
                                placeholder="해지 사유를 적어 주세요."
                                maxLength={500}
                            />
                        </>
                    )}
                </fieldset>

                {/* 기관명 확인 */}
                <div>
                    <label htmlFor="withdraw-confirm-name" className="label">
                        확인을 위해 기관명 <span className="font-bold text-surface-900 dark:text-surface-100 break-keep">{orgName}</span> 을(를) 똑같이 입력하세요 <span className="text-red-700 dark:text-red-300" aria-hidden="true">*</span>
                    </label>
                    <input
                        id="withdraw-confirm-name"
                        type="text"
                        value={confirmName}
                        onChange={e => setConfirmName(e.target.value)}
                        className="input min-h-[48px]"
                        placeholder={orgName}
                        autoComplete="off"
                        aria-invalid={confirmName.trim() !== '' && !nameMatches ? true : undefined}
                    />
                    {confirmName.trim() !== '' && !nameMatches && (
                        <p className="text-xs text-red-700 dark:text-red-300 mt-1">기관명이 다릅니다. 띄어쓰기까지 똑같이 적어 주세요.</p>
                    )}
                </div>

                {/* 액션 */}
                <div>
                    <div className="flex gap-3 pt-1">
                        <button type="button" onClick={close} disabled={submitting} className="btn-secondary flex-1 min-h-[48px]">
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            aria-describedby={missing ? 'withdraw-missing' : undefined}
                            className="btn-danger flex-1 min-h-[48px]"
                        >
                            {submitting ? (<><span className="w-4 h-4 spinner" aria-hidden="true" />해지하는 중…</>) : '서비스 해지'}
                        </button>
                    </div>
                    {missing && !submitting && (
                        <p id="withdraw-missing" className="text-xs text-surface-600 dark:text-surface-400 mt-2">
                            누르려면: {missing}
                        </p>
                    )}
                </div>
            </div>
        </PanelModal>
    );
}
