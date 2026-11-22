/**
 * ManagerSection — 기관 관리 책임자 정·부 (2026-11-22)
 *
 * 기관 전체에 한 쌍만 기록한다(예: 정 '관장 홍길동', 부 '사무국장 김철수'). 권한과는 상관없고,
 * 라벨 인쇄 때 넣을 수 있다.
 */
import type { SettingsForm } from '../../../hooks/useSettings';

interface Props {
    form: SettingsForm;
    setForm: React.Dispatch<React.SetStateAction<SettingsForm>>;
    handleSave: (e?: React.FormEvent | null, overrides?: Partial<SettingsForm>) => Promise<void>;
    saving: boolean;
}

export const MANAGER_TEXT_MAX = 50;

export default function ManagerSection({ form, setForm, handleSave, saving }: Props) {
    const save = () => handleSave(null, {
        managerPrimary: form.managerPrimary.trim(),
        managerSecondary: form.managerSecondary.trim(),
    });
    return (
        <section className="glass-card p-6 mb-6" aria-labelledby="manager-title">
            <h2 id="manager-title" className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-1">관리 책임자</h2>
            <p className="text-sm text-surface-500 dark:text-surface-400 mb-4">
                기관의 물품 관리 책임자를 정·부로 적어 둡니다. 기록용이며 권한과는 상관없고, 라벨을 인쇄할 때 넣을 수 있어요.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="manager-primary" className="label">정 (책임자)</label>
                    <input id="manager-primary" type="text" className="input min-h-[48px]" maxLength={MANAGER_TEXT_MAX}
                        placeholder="예: 관장 홍길동" value={form.managerPrimary}
                        onChange={(e) => setForm((prev) => ({ ...prev, managerPrimary: e.target.value }))} />
                </div>
                <div>
                    <label htmlFor="manager-secondary" className="label">부 (대리)</label>
                    <input id="manager-secondary" type="text" className="input min-h-[48px]" maxLength={MANAGER_TEXT_MAX}
                        placeholder="예: 사무국장 김철수" value={form.managerSecondary}
                        onChange={(e) => setForm((prev) => ({ ...prev, managerSecondary: e.target.value }))} />
                </div>
            </div>
            <div className="flex justify-end mt-4">
                <button type="button" className="btn-primary min-h-[48px] px-5" disabled={saving} onClick={() => void save()}>저장</button>
            </div>
        </section>
    );
}
