// 사내 근태 사이트 창에 주입되는 스크립트.
// 페이지가 열릴 때마다 실행되고, 근태 표 행이 보이면 표 HTML을 앱으로 보낸다.
// __ROW_SELECTOR__ 는 Rust에서 실제 선택자 문자열로 바뀐다.
(function () {
  if (window.top !== window) return; // iframe 안에서는 실행하지 않음
  var ROW_SELECTOR = __ROW_SELECTOR__;
  var sent = false;
  var lastCount = -1;
  var stableTicks = 0;

  function badge(text) {
    var el = document.getElementById('__worktime_badge');
    if (!el) {
      el = document.createElement('div');
      el.id = '__worktime_badge';
      el.style.cssText =
        'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#2647c7;color:#fff;' +
        'padding:10px 14px;border-radius:6px;font:13px/1.4 "Malgun Gothic",sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25)';
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = text;
  }

  function tick() {
    if (sent || !document.body) return;
    var rows = document.querySelectorAll(ROW_SELECTOR);
    if (!rows.length) {
      badge('근무시간 관리: 근태 조회 화면을 열면 자동으로 읽습니다');
      return;
    }
    // 표가 다 그려질 때까지 행 수가 2번 연속 같으면 전송
    if (rows.length === lastCount) stableTicks += 1;
    else stableTicks = 0;
    lastCount = rows.length;
    badge('근태 표 ' + rows.length + '행을 찾았습니다. 읽는 중…');
    if (stableTicks < 2) return;

    var table = rows[0].closest('table');
    var html = table ? table.outerHTML : Array.prototype.map.call(rows, function (r) { return r.outerHTML; }).join('');
    sent = true;
    window.__TAURI_INTERNALS__
      .invoke('submit_attendance_html', { html: html })
      .catch(function (e) {
        sent = false;
        badge('앱으로 보내지 못했습니다: ' + e);
      });
  }

  setInterval(tick, 700);
})();
