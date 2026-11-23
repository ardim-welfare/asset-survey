/**
 * org-usage-stats — 한 기관의 입력 상태를 **숫자로만** 본다 (읽기 전용, 운영 진단용)
 *
 * 사용법: npx tsx scripts/org-usage-stats.ts <기관 이름 일부>
 *
 * 개인정보(이름·이메일)와 기관이 적은 글(위치·품명·메모)은 출력하지 않는다 — 건수·비율만.
 * 시범 기관의 데이터 입력 테스트를 보고 무엇이 막히는지 판단할 때 쓴다(2026-11-23).
 */
import { getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { initAdminApp } from './lib/adminApp';

initAdminApp();
const db = getFirestore();

const keyword = process.argv[2] || '';
if (!keyword) {
    console.error('사용법: npx tsx scripts/org-usage-stats.ts <기관 이름 일부>');
    process.exit(1);
}

const pct = (n: number, d: number) => (d === 0 ? '-' : `${Math.round((n / d) * 100)}%`);
const count = (list: DocumentData[], f: (d: DocumentData) => boolean) => list.filter(f).length;

async function all(col: string, orgId: string): Promise<DocumentData[]> {
    const snap = await db.collection(col).where('organizationId', '==', orgId).get();
    return snap.docs.map((d) => d.data());
}

async function main() {
    const orgs = (await db.collection('organizations').get()).docs.filter((d) => String(d.data().name ?? '').includes(keyword));
    if (orgs.length === 0) { console.log(`'${keyword}'가 들어간 기관이 없습니다.`); return; }
    for (const o of orgs) {
        const org = o.data();
        const id = o.id;
        console.log(`\n=== 기관 (status=${org.status}, 조사 방식=${org.surveyMode ?? '-'}) ===`);

        const users = await all('users', id);
        const pre = (await db.collection('organizations').doc(id).collection('preRegistered').get()).docs.map((d) => d.data());
        const teams = await all('teams', id);
        console.log(`[직원] 활성 ${count(users, (u) => u.status !== 'disabled')} (관리자 ${count(users, (u) => u.role === 'admin')}) · 비활성 ${count(users, (u) => u.status === 'disabled')} · 팀 있음 ${count(users, (u) => !!u.teamId)}`);
        console.log(`[가입 대기] ${pre.length}명 · 팀 정함 ${count(pre, (p) => !!p.teamId)} · 이메일 없음 ${count(pre, (p) => !p.email)}`);
        console.log(`[팀] ${count(teams, (t) => !t.archived)}개 (삭제 ${count(teams, (t) => !!t.archived)})`);

        const buildings = await all('buildings', id);
        const spaces = await all('spaces', id);
        const activeSpaces = spaces.filter((s) => !s.archived);
        const noAssignee = count(activeSpaces, (s) => (s.managerUids ?? []).length === 0 && (s.teamIds ?? []).length === 0);
        console.log(`[건물] ${count(buildings, (b) => !b.archived)}개 · 층 합계 ${buildings.reduce((n, b) => n + (b.floors?.length ?? 0), 0)}`);
        console.log(`[공간] ${activeSpaces.length}곳 (삭제 ${spaces.length - activeSpaces.length}) · 담당 없음 ${noAssignee} (${pct(noAssignee, activeSpaces.length)}) · 팀 담당 ${count(activeSpaces, (s) => (s.teamIds ?? []).length > 0)} · 건물 지정 ${count(activeSpaces, (s) => !!s.buildingId)} · 층 지정 ${count(activeSpaces, (s) => !!s.floor)}`);

        const assets = await all('assets', id);
        const n = assets.length;
        const active = assets.filter((a) => a.status === 'active');
        const unplaced = assets.filter((a) => !a.spaceId);
        const unplacedLocations = new Set(unplaced.map((a) => a.locationRaw ?? '(빈 위치)'));
        console.log(`[재물] ${n}건 · 운영 ${active.length} · 불용 ${count(assets, (a) => a.status === 'inactive')} · 폐기 ${count(assets, (a) => a.status === 'disposed')}`);
        console.log(`  공간 미지정 ${unplaced.length} (${pct(unplaced.length, n)}) · 그 위치 종류 ${unplacedLocations.size}가지 · 위치 글자도 없음 ${count(unplaced, (a) => !a.locationRaw)}`);
        console.log(`  직접 등록 ${count(assets, (a) => !!a.manual)} · 대장에 없음 ${count(assets, (a) => !!a.missingFromSource)} · 라벨 있음 ${count(assets, (a) => !!a.tagId)} (${pct(count(assets, (a) => !!a.tagId), n)}) · 사진 ${count(assets, (a) => !!a.photoUrl)}`);
        console.log(`  빈 칸 — 품명 ${count(assets, (a) => !a.name)} · 분류 ${count(assets, (a) => !a.category)} · 취득일자 ${count(assets, (a) => !a.acquiredAt)} · 부서 ${count(assets, (a) => !a.department)} · 수량 ${count(assets, (a) => a.quantity == null)} · 내용연수 있음 ${count(assets, (a) => a.usefulLife != null)}`);
        const acc = await all('assetAccounting', id);
        console.log(`  금액 문서 ${acc.length} · 금액 빈 칸 ${count(acc, (a) => a.amount == null)}`);

        const imports = (await all('imports', id)).sort((a, b) => (b.confirmedAt?.toMillis?.() ?? 0) - (a.confirmedAt?.toMillis?.() ?? 0));
        console.log(`[가져오기] ${imports.length}번`);
        for (const im of imports.slice(0, 5)) {
            const mapped = Object.keys(im.columnMap ?? {}).sort().join(',');
            const total = im.amountTotal ?? 0;
            const reported = im.reportedTotal;
            console.log(`  - ${im.confirmedAt?.toDate?.().toISOString().slice(0, 16) ?? '?'} 전체 ${im.counts?.total ?? '?'} · 새로 ${im.diff?.added ?? '?'} 바뀜 ${im.diff?.changed ?? '?'} 대장에없음 ${im.diff?.missing ?? '?'} · 합계 대조 ${reported == null ? '합계줄 없음' : reported === total ? '같음' : `다름(차 ${Math.abs(reported - total)})`}`);
            console.log(`    연결한 열: ${mapped}`);
        }

        const surveys = await all('surveys', id);
        const scans = await all('scans', id);
        const checks = await all('assetChecks', id);
        console.log(`[조사] 회차 ${surveys.length} (진행 ${count(surveys, (s) => s.status === 'open')}, 마감 ${count(surveys, (s) => s.status === 'closed')}) · 스캔 ${scans.length} (직접 입력 ${count(scans, (s) => s.method === 'manual')}, 미등록 ${count(scans, (s) => s.result === 'unregistered')}) · 상시 확인 ${checks.length}`);
        for (const s of surveys) console.log(`  - 상태 ${s.status} · 대상 ${s.targetCount} · 방식 ${s.mode} · 공간 ${s.spaceIds?.length ?? 0}곳`);

        const subs = await all('surveySubmissions', id);
        console.log(`  제출 ${subs.length} (제출 ${count(subs, (x) => x.state === 'submitted')}, 승인 ${count(subs, (x) => x.state === 'approved')}, 반려 ${count(subs, (x) => x.state === 'rejected')})`);

        const fb = (await db.collection('feedbacks').where('organizationId', '==', id).get()).size;
        console.log(`[의견] ${fb}건`);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
