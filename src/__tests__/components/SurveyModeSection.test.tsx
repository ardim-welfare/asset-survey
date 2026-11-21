/**
 * SurveyModeSection — 조사 방식 선택 (기획서 F02)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SurveyModeSection from '../../components/admin/settings/SurveyModeSection';

describe('SurveyModeSection', () => {
    it('현재 값이 선택돼 있고, 다른 방식을 고르면 그 값으로 저장을 요청한다', () => {
        const onChange = vi.fn();
        render(<SurveyModeSection value="delegated" saving={false} onChange={onChange} />);

        const delegated = screen.getByRole('radio', { name: /나눠서 조사/ });
        const solo = screen.getByRole('radio', { name: /혼자 조사/ });
        expect(delegated).toBeChecked();
        expect(solo).not.toBeChecked();

        fireEvent.click(solo);
        expect(onChange).toHaveBeenCalledWith('solo');
    });

    it('저장 중에는 고를 수 없다', () => {
        render(<SurveyModeSection value="solo" saving onChange={vi.fn()} />);
        expect(screen.getByRole('radio', { name: /나눠서 조사/ })).toBeDisabled();
    });
});
