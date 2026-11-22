/**
 * SurveyModeSection — 조사 방식 선택 (기획서 F02)
 *
 * 고르는 즉시 저장한다(부분 저장 patch). 실패하면 useSettings.handleSave가 이전 값으로 되돌린다.
 */
import type { SurveyMode } from '../../../types/organization';

interface SurveyModeSectionProps {
    value: SurveyMode;
    saving: boolean;
    onChange: (mode: SurveyMode) => void;
}

const OPTIONS: Array<{ value: SurveyMode; title: string; desc: string }> = [
    {
        value: 'delegated',
        title: '나눠서 조사',
        desc: '공간 담당자가 자기 공간을 스캔해 제출하고, 재물 담당자가 승인하거나 돌려보냅니다. 공간이 많거나 떨어진 시설이 있는 기관에 맞습니다.',
    },
    {
        value: 'solo',
        title: '혼자 조사',
        desc: '재물 담당자가 모든 공간을 직접 스캔하고 바로 마감합니다. 공간 담당자 지정 없이 쓸 수 있어 작은 기관에 맞습니다.',
    },
];

export default function SurveyModeSection({ value, saving, onChange }: SurveyModeSectionProps) {
    return (
        <fieldset className="glass-card p-6 mb-6" disabled={saving}>
            <legend className="sr-only">조사 방식</legend>
            <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-1" aria-hidden="true">조사 방식</h3>
            <p className="text-xs text-surface-600 dark:text-surface-400 mb-4">
                재물조사를 누가 스캔하고 어떻게 마감할지 정합니다. 고르면 바로 저장되고, 다음에 여는 조사부터 적용됩니다.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {OPTIONS.map((opt) => {
                    const checked = value === opt.value;
                    return (
                        <label
                            key={opt.value}
                            className={`flex gap-3 p-4 rounded-xl border cursor-pointer transition-colors min-h-[48px] ${checked
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                                : 'border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800'}`}
                        >
                            <input
                                type="radio"
                                name="surveyMode"
                                value={opt.value}
                                checked={checked}
                                onChange={() => { if (!checked) onChange(opt.value); }}
                                className="mt-0.5 w-5 h-5 flex-shrink-0 accent-primary-600"
                            />
                            <span>
                                <span className="block font-semibold text-sm text-surface-900 dark:text-surface-100">{opt.title}</span>
                                <span className="block text-xs text-surface-600 dark:text-surface-400 mt-1 leading-relaxed">{opt.desc}</span>
                            </span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}
