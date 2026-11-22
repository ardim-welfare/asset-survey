/**
 * EmployeeManager — 직원 관리 (2026-11-22 흐름대로 다시 짬)
 *
 * 사용자 의견("팀 등록하고 직원 등록하는 과정이 마음에 들지 않는다")과 인터페이스 점검에 따라 화면을
 * 하는 순서대로 놓는다: ① 팀 만들기 → ② 직원 등록(미리 등록하거나 초대 링크 보내기) → ③ 직원 목록.
 * - 사전 등록 창은 제대로 된 대화상자(PanelModal: Esc·첫 칸 초점·aria)이고, 창 안에서 바로 새 팀을 만들 수 있다.
 * - 가입 대기 직원의 팀도 목록에서 바꾼다(예전엔 지우고 다시 등록해야 했다).
 * - 복사 버튼은 글자 링크가 아니라 버튼 모양, 복사하면 알림.
 * 로직은 useEmployeeManager·useTeams.
 */
import { useState, type FormEvent } from 'react';
import useEmployeeManager from '../../hooks/useEmployeeManager';
import { useAuth } from '../../hooks/useAuth';
import { APP_URL } from '../../lib/constants';
import { SkeletonList, SkeletonBox } from '../common/Skeleton';
import EmployeeListItem from './EmployeeListItem';
import TeamSection from './TeamSection';
import PanelModal from './space/PanelModal';
import useTeams from '../../hooks/useTeams';
import { TEAM_NAME_MAX } from '../../schemas/team';

const NEW_TEAM = '__new__';
const stepTitle = 'flex items-center gap-2 font-semibold text-surface-900 dark:text-surface-100';
const stepNum = 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-600 text-white text-xs font-bold';

export default function EmployeeManager() {
    const {
        organization, loading,
        showAddForm, setShowAddForm,
        newEmployee, setNewEmployee,
        regenerating,
        editingId, setEditingId, editForm, setEditForm,
        searchQuery, setSearchQuery, teamFilter, setTeamFilter,
        filteredUnifiedList, stats, employees,
        handleAddEmployee, handleCopyInviteCode, handleRegenerateCode,
        handleEditEmployee, handleSaveEdit, handleDeleteEmployee, handleChangeRole,
        handleDeletePreRegistered, handleRestoreEmployee, handleDeletePermanently, handleChangeTeam, handleChangePendingTeam,
    } = useEmployeeManager();
    const { userData } = useAuth();
    const selfUid = userData?.id;
    const teams = useTeams(userData?.organizationId);
    const memberCount = (teamId: string) => employees.filter((e) => e.teamId === teamId).length;
    // 사전 등록 창에서 바로 새 팀 만들기
    const [creatingTeam, setCreatingTeam] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');

    const closeAdd = () => { setShowAddForm(false); setCreatingTeam(false); setNewTeamName(''); };
    const createTeamInDialog = async () => {
        const id = await teams.addTeam(newTeamName);
        if (id) { setNewEmployee({ ...newEmployee, teamId: id }); setCreatingTeam(false); setNewTeamName(''); }
    };
    const submitAdd = async (e: FormEvent<HTMLFormElement>) => { await handleAddEmployee(e); setCreatingTeam(false); };
    const filtering = searchQuery.trim() !== '' || teamFilter !== 'all';

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto animate-fade-in">
                <SkeletonBox className="h-7 w-28 mb-1" />
                <SkeletonBox className="h-4 w-40 mb-6" />
                <SkeletonList count={4} />
            </div>
        );
    }

    const inviteLink = `${APP_URL}?code=${organization?.inviteCode || '------'}`;

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">팀·직원 관리</h1>
                <p className="text-sm text-surface-600 dark:text-surface-400 mt-1" aria-live="polite">
                    총 {stats.total}명
                    {stats.active > 0 && <> · 활성 {stats.active}명</>}
                    {stats.pending > 0 && <> · <span className="text-amber-700 dark:text-amber-300">가입 대기 {stats.pending}명</span></>}
                    {stats.disabled > 0 && <> · <span className="text-red-700 dark:text-red-300">비활성 {stats.disabled}명</span></>}
                </p>
            </div>

            {/* ① 팀 만들기 */}
            <TeamSection t={teams} memberCount={memberCount} step={<span className={stepNum} aria-hidden="true">1</span>} />

            {/* ② 직원 등록 — 미리 등록하거나 초대 링크를 보낸다 */}
            <section className="glass-card p-4 mb-6" aria-labelledby="add-staff-title">
                <h2 id="add-staff-title" className={stepTitle}><span className={stepNum} aria-hidden="true">2</span> 직원 등록</h2>
                <p className="text-xs text-surface-600 dark:text-surface-400 mt-1 mb-3">
                    이름·이메일·팀을 미리 등록해 두면, 직원이 초대 링크로 가입할 때 이름과 팀이 저절로 들어갑니다.
                </p>
                <button type="button" onClick={() => setShowAddForm(true)} className="btn-primary min-h-[48px] px-5 w-full sm:w-auto">
                    + 직원 미리 등록하기
                </button>

                <div className="mt-4 pt-4 border-t border-surface-100 dark:border-surface-700">
                    <p className="text-sm font-medium text-surface-800 dark:text-surface-200 mb-2">초대 링크 보내기</p>
                    <p className="font-mono text-sm text-surface-700 dark:text-surface-300 break-all bg-surface-50 dark:bg-surface-800/60 rounded-lg p-3 select-all">{inviteLink}</p>
                    <p className="text-sm text-surface-700 dark:text-surface-300 mt-2">
                        기관 코드 <span className="font-mono text-lg font-bold text-primary-700 dark:text-primary-300 select-all">{organization?.inviteCode || '------'}</span>
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                        <button type="button" onClick={() => void handleCopyInviteCode('link')} className="btn-secondary btn-sm min-h-[44px] px-4">링크 복사</button>
                        <button type="button" onClick={() => void handleCopyInviteCode('code')} className="btn-secondary btn-sm min-h-[44px] px-4">코드 복사</button>
                        <button type="button" onClick={() => void handleRegenerateCode()} disabled={regenerating} className="btn-secondary btn-sm min-h-[44px] px-4">
                            {regenerating ? '새로 만드는 중…' : '코드 새로 만들기'}
                        </button>
                    </div>
                    <p className="text-xs text-surface-600 dark:text-surface-400 mt-2">코드를 새로 만들면 예전 링크·코드로는 가입할 수 없습니다.</p>
                </div>
            </section>

            {/* 직원 미리 등록 창 */}
            <PanelModal open={showAddForm} title="직원 미리 등록" titleId="add-employee-title" onClose={closeAdd}>
                <form onSubmit={(e) => void submitAdd(e)} className="space-y-4">
                    <div>
                        <label htmlFor="new-employee-name" className="label">이름 <span className="text-red-700 dark:text-red-300">*</span></label>
                        <input id="new-employee-name" type="text" autoComplete="name" required aria-required="true" value={newEmployee.name}
                            onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })} className="input min-h-[48px]" placeholder="홍길동" />
                    </div>
                    <div>
                        <label htmlFor="new-employee-email" className="label">이메일(구글 계정) <span className="text-red-700 dark:text-red-300">*</span></label>
                        <input id="new-employee-email" type="email" autoComplete="email" inputMode="email" required aria-required="true" value={newEmployee.email}
                            onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })} className="input min-h-[48px]" placeholder="example@gmail.com" />
                    </div>
                    <div>
                        <label htmlFor="new-employee-team" className="label">팀</label>
                        {creatingTeam ? (
                            <>
                                <div className="flex gap-2">
                                    {/* 팀 이름 칸에서 Enter(휴대폰 '완료')를 누르면 직원 등록이 먼저 제출됐다 — 팀 만들기로 돌린다 */}
                                    <input id="new-employee-team" type="text" value={newTeamName} maxLength={TEAM_NAME_MAX} placeholder="새 팀 이름 (예: 행정지원팀)"
                                        enterKeyHint="done"
                                        onKeyDown={(e) => {
                                            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                                            e.preventDefault();
                                            if (!teams.busy && newTeamName.trim()) void createTeamInDialog();
                                        }}
                                        onChange={(e) => setNewTeamName(e.target.value)} className="input flex-1 min-w-0 min-h-[48px]" />
                                    <button type="button" className="btn-primary min-h-[48px] px-3 flex-shrink-0" disabled={teams.busy || !newTeamName.trim()} onClick={() => void createTeamInDialog()}>팀 만들기</button>
                                </div>
                                {/* 잘못 골랐을 때 돌아갈 길 — 예전엔 창을 닫아야만 팀 고르기로 돌아갔다 */}
                                <button type="button" className="btn-secondary btn-sm min-h-[44px] px-3 mt-2" onClick={() => { setCreatingTeam(false); setNewTeamName(''); }}>
                                    있는 팀에서 고르기
                                </button>
                            </>
                        ) : (
                            <select id="new-employee-team" value={newEmployee.teamId} className="input min-h-[48px]"
                                onChange={(e) => {
                                    if (e.target.value === NEW_TEAM) { setCreatingTeam(true); return; }
                                    setNewEmployee({ ...newEmployee, teamId: e.target.value });
                                }}>
                                <option value="">팀 없음</option>
                                {teams.activeTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                <option value={NEW_TEAM}>+ 새 팀 만들기…</option>
                            </select>
                        )}
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={closeAdd} className="btn-secondary flex-1 min-h-[48px]">닫기</button>
                        <button type="submit" className="btn-primary flex-1 min-h-[48px]">등록</button>
                    </div>
                    <p className="text-xs text-surface-600 dark:text-surface-400">등록하면 창이 닫힙니다. 같은 팀 직원을 이어서 넣을 때는 팀이 그대로 남아 있어요.</p>
                </form>
            </PanelModal>

            {/* ③ 직원 목록 */}
            <h2 className={`${stepTitle} mb-3`}><span className={stepNum} aria-hidden="true">3</span> 직원 목록</h2>
            {stats.total > 0 && (
                <div className="grid gap-2 sm:grid-cols-[1fr_12rem] mb-4">
                    <div>
                        <label htmlFor="employee-search" className="sr-only">직원 검색</label>
                        <input id="employee-search" type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            className="input min-h-[48px]" placeholder="이름, 이메일 검색" />
                    </div>
                    {teams.activeTeams.length > 0 && (
                        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="input min-h-[48px]" aria-label="팀으로 거르기">
                            <option value="all">전체 팀</option>
                            <option value="none">팀 없음</option>
                            {teams.activeTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    )}
                </div>
            )}

            {stats.total === 0 ? (
                <div className="glass-card p-8 text-center">
                    <div className="text-4xl mb-3" aria-hidden="true">👥</div>
                    <p className="text-surface-800 dark:text-surface-200 font-medium">아직 등록한 직원이 없습니다</p>
                    <p className="text-sm text-surface-600 dark:text-surface-400 mt-1">위 ② 에서 직원을 미리 등록하거나 초대 링크를 보내세요.</p>
                </div>
            ) : filteredUnifiedList.length === 0 ? (
                <div className="glass-card p-8 text-center" aria-live="polite">
                    <p className="text-surface-800 dark:text-surface-200 font-medium">조건에 맞는 직원이 없습니다</p>
                    {filtering && (
                        <button type="button" className="btn-secondary min-h-[44px] px-4 mt-3" onClick={() => { setSearchQuery(''); setTeamFilter('all'); }}>
                            검색·거르기 지우기
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredUnifiedList.map((member) => (
                        <EmployeeListItem
                            key={`${member.memberStatus}-${member.id}`}
                            member={member}
                            selfUid={selfUid}
                            editingId={editingId}
                            editForm={editForm}
                            setEditForm={setEditForm}
                            onEdit={handleEditEmployee}
                            onSaveEdit={handleSaveEdit}
                            onCancelEdit={() => setEditingId(null)}
                            onDelete={handleDeleteEmployee}
                            onChangeRole={handleChangeRole}
                            teams={teams.activeTeams}
                            teamName={teams.teamName}
                            onChangeTeam={handleChangeTeam}
                            onChangePendingTeam={(id, teamId) => void handleChangePendingTeam(id, teamId)}
                            onDeletePreRegistered={handleDeletePreRegistered}
                            onRestore={handleRestoreEmployee}
                            onDeletePermanently={handleDeletePermanently}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
