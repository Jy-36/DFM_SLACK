// DFM Slack에 넣을 수 있는 앱(탭) 목록. 새 앱은 src/apps/<이름>/ 에 만들고 여기에 한 줄 추가한다.
import WorkTime from '../apps/worktime/WorkTime.jsx';
import Mto from '../apps/mto/Mto.jsx';
import Techmap from '../apps/techmap/Techmap.jsx';
import OsChecker from '../apps/oschecker/OsChecker.jsx';

// disabled: true 인 앱은 탭 목록 · + 메뉴에서 빠진다 (코드는 그대로, 다시 켜려면 줄을 지우면 됨)
const ALL_APPS = [
  {
    id: 'worktime',
    name: 'WorkTime',
    desc: '선택근무제 근무시간 정산·계획',
    icon: 'clock',
    component: WorkTime,
    disabled: true, // 이번 Prototype에서는 OS Checker만
  },
  {
    id: 'mto',
    name: 'MTO',
    desc: 'GDS·Layer List로 STEP2·MTO 일정 계산, 간트·병목 분석',
    icon: 'mask',
    component: Mto,
    disabled: true, // 이번 Prototype에서는 OS Checker만
  },
  {
    id: 'techmap',
    name: 'Techmap',
    desc: 'Site Request로 techfile · layermap · drf 검토 · 업데이트',
    icon: 'techmap',
    component: Techmap,
    disabled: true, // 이번 Prototype에서는 OS Checker만
  },
  {
    id: 'oschecker',
    name: 'OS Checker',
    desc: '두 Text를 붙여 넣어 Structure별 Size(UR X×Y ↔ Chip Size×0.98) 일치 확인',
    icon: 'ossize',
    component: OsChecker,
  },
];

export const APPS = ALL_APPS.filter((a) => !a.disabled);

export const appById = (id) => APPS.find((a) => a.id === id) || null;
