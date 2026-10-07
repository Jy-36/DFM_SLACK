// DFM Slack에 넣을 수 있는 앱(탭) 목록. 새 앱은 src/apps/<이름>/ 에 만들고 여기에 한 줄 추가한다.
import WorkTime from '../apps/worktime/WorkTime.jsx';
import Mto from '../apps/mto/Mto.jsx';

export const APPS = [
  {
    id: 'worktime',
    name: 'WorkTime',
    desc: '선택근무제 근무시간 정산·계획',
    icon: 'clock',
    component: WorkTime,
  },
  {
    id: 'mto',
    name: 'MTO',
    desc: 'GDS·Layer List로 STEP2·MTO 일정 계산, 간트·병목 분석',
    icon: 'mask',
    component: Mto,
  },
];

export const appById = (id) => APPS.find((a) => a.id === id) || null;
