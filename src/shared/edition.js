// 배포판 이름. prototype 브랜치는 사내판(DFM Slack)과 같이 설치할 수 있게 이름을 따로 쓴다.
// 설치 이름·데이터 폴더는 src-tauri/tauri.conf.json 의 productName·identifier 가 정한다.
export const EDITION = 'Prototype';
export const APP_NAME = EDITION ? `DFM Slack ${EDITION}` : 'DFM Slack';
