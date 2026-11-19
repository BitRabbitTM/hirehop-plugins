/*
 * Kyoto view - a per-device tidy-up layer for HireHop.
 *
 * A small "Kyoto view" switch (bottom-left) turns it on or off for this browser
 * only. Off = HireHop exactly as it comes. On = fewer menu entries, quick
 * actions on the home page, scan and carnet shortcuts on jobs, and a
 * phone-friendlier Scanning page.
 *
 * It only hides, restyles and adds shortcuts. Anything that changes data goes
 * through HireHop's own functions and confirmations.
 */
(function () {
	'use strict';

	var VERSION = '0.2.2';
	var KEY = 'kyoto_view_on';
	if (typeof window.jQuery === 'undefined') return;
	var $ = window.jQuery, path = window.location.pathname;
	if (/^\/settings\.php/.test(path) || /^\/login/.test(path)) return;

	// Menu entries hidden while Kyoto view is on (ids of HireHop's own menu items)
	var HIDE_MENU = ['labour', 'consumables', 'resources', 'batch_invoicing', 'route_planner', 'driver_app', 'epos'];
	var DAYS_AHEAD = 7; // "going out soon" window for the quick-action job lists

	function stored() { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } }
	function isOn() {
		var v = stored();
		if (v === null) return window.matchMedia && window.matchMedia('(max-width: 800px)').matches; // phones default to on
		return v === '1';
	}
	function setOn(on) { try { window.localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {} window.location.reload(); }
	function safe(name, fn) { try { fn(); } catch (e) { if (window.console) console.log('Kyoto view: ' + name + ' skipped', e); } }
	function esc(s) { return $('<div>').text(s == null ? '' : String(s)).html(); }
	function pad(n) { return (n < 10 ? '0' : '') + n; }
	function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
	function niceDate(s) {
		if (!s) return '';
		var d = new Date(String(s).replace(' ', 'T'));
		if (isNaN(d)) return '';
		return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
	}
	function scanUrl(jobId, kind) { return '/modules/scanning/?main_id=' + encodeURIComponent(jobId) + '&kind=' + kind; }
	function statusName(n) { try { return window.lang.statusValues[n] || ''; } catch (e) { return ''; } }

	// ---------------------------------------------------------------- styles
	function addStyles() {
		var hide = $.map(HIDE_MENU, function (id) { return 'body.kyoto-view #header_nav_menu_' + id; }).join(',');
		var css = [
			'#kyoto_view_toggle{position:fixed;left:8px;bottom:8px;z-index:99999;font:12px/1 sans-serif;padding:6px 10px;border-radius:14px;cursor:pointer;opacity:.55;background:#222;color:#fff;border:1px solid #666;user-select:none}',
			'#kyoto_view_toggle:hover{opacity:1}',
			'#kyoto_view_toggle.on{background:#b3123a;border-color:#b3123a;opacity:.8}',
			hide + '{display:none !important}',
			'.kyoto-qa{margin:0 0 12px 0;padding:10px;border-radius:8px;border:1px solid rgba(128,128,128,.4)}',
			'.kyoto-qa h3{margin:0 0 8px 0;font-size:1.05em;font-weight:600}',
			'.kyoto-qa-btns{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}',
			'.kyoto-btn{display:block;padding:14px 10px;border-radius:8px;border:1px solid rgba(128,128,128,.5);background:rgba(128,128,128,.15);color:inherit;font-size:1.05em;font-weight:600;text-align:center;cursor:pointer}',
			'.kyoto-btn:hover,.kyoto-btn.active{background:#b3123a;color:#fff;border-color:#b3123a}',
			'.kyoto-list{margin-top:10px}',
			'.kyoto-job{display:flex;gap:10px;align-items:center;padding:10px;border-radius:6px;border:1px solid rgba(128,128,128,.35);margin-bottom:6px;cursor:pointer}',
			'.kyoto-job:hover{background:rgba(128,128,128,.2)}',
			'.kyoto-job .num{font-weight:700;min-width:4.2em}',
			'.kyoto-job .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.kyoto-job .meta{opacity:.75;font-size:.9em;white-space:nowrap}',
			'.kyoto-job.blocked{opacity:.6}',
			'.kyoto-note{opacity:.75;font-size:.9em;padding:6px 2px}',
			'#kyoto_job_bar{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 8px 0}',
			'#kyoto_job_bar .kyoto-btn{padding:10px 16px;font-size:1em}',
			'#kyoto_flash{position:fixed;left:0;right:0;top:0;z-index:99998;padding:18px 14px;font:700 20px/1.25 sans-serif;color:#fff;text-align:center;display:none;pointer-events:none}',
			'#kyoto_flash.ok{background:rgba(22,140,60,.95)}#kyoto_flash.bad{background:rgba(190,30,30,.96)}',
			'@media (max-width:800px){',
			' body.kyoto-view.kyoto-scan .hh_scanning_app button,body.kyoto-view.kyoto-scan .hh_scanning_app .ui-button{min-height:44px;font-size:16px}',
			' body.kyoto-view.kyoto-scan .hh_scanning_app input[type=text],body.kyoto-view.kyoto-scan .hh_scanning_app select{min-height:40px;font-size:16px}',
			' body.kyoto-view.kyoto-scan .hh_scanning_app .pq-grid-cell{font-size:15px;padding-top:8px;padding-bottom:8px}',
			' body.kyoto-view.kyoto-scan #scan_video{max-width:100%}',
			'}'
		].join('\n');
		$('<style>', { id: 'kyoto_view_css', text: css }).appendTo(document.head);
	}

	function addToggle(on) {
		if (/^\/modules\/scanning(\/|$)/.test(path)) return; // keep the scan box clear; switch from any other page
		$('<div>', { id: 'kyoto_view_toggle', 'class': on ? 'on' : '', title: 'Kyoto view ' + VERSION + ' - simplified HireHop for this device only. Click to switch.', text: 'Kyoto view: ' + (on ? 'ON' : 'OFF') })
			.appendTo(document.body).on('click', function () { setOn(!on); });
	}

	// ------------------------------------------------------- home quick actions
	function fetchJobs(statuses, upToDays) {
		var tz = (typeof window.timezone === 'string' && window.timezone) || (window.Intl ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Europe/London');
		var now = new Date(), from = '';
		if (upToDays !== null) { var d = new Date(now.getTime() + upToDays * 86400000); from = ymd(d) + ' 00:00:00'; }
		return $.ajax({
			url: '/php_functions/search_list.php', type: 'get', dataType: 'json',
			data: {
				pq_datatype: 'JSON', pq_sort: JSON.stringify([{ dataIndx: 'OUT_DATE', dir: 'up', dataType: 'date' }]),
				local: ymd(now) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()), tz: tz,
				page: 0, rows: 100, from_date: from, to_date: '', jobs: 1, projects: 0, open: 0, closed: 0, money_owed: 0,
				is_late: 0, mine: 0, no_user: 0, needs_bill: 0, only_open_ended: 0, status: statuses.join(',')
			}
		});
	}

	function homeQuickActions() {
		if (!/^\/home\.php/.test(path)) return;
		var host = $('#search_tab .pane-left').first();
		if (!host.length) return;
		var box = $('<div>', { 'class': 'kyoto-qa' }).prependTo(host);
		$('<h3>', { text: 'Warehouse' }).appendTo(box);
		var btns = $('<div>', { 'class': 'kyoto-qa-btns' }).appendTo(box), list = $('<div>', { 'class': 'kyoto-list' }).appendTo(box);
		var actions = [
			{ label: 'Prep a job', kind: 1, statuses: [1, 2, 3], days: DAYS_AHEAD, dateKey: 'OUT_DATE', dateWord: 'out' },
			{ label: 'Scan a job out', kind: 2, statuses: [1, 2, 3, 4], days: DAYS_AHEAD, dateKey: 'OUT_DATE', dateWord: 'out' },
			{ label: 'Scan a job in', kind: 3, statuses: [4, 5, 6], days: null, dateKey: 'RETURN_DATE', dateWord: 'back' }
		];
		$.each(actions, function (i, a) {
			$('<div>', { 'class': 'kyoto-btn', text: a.label }).appendTo(btns).on('click', function () {
				btns.find('.kyoto-btn').removeClass('active'); $(this).addClass('active');
				list.html('<div class="kyoto-note">Loading jobs…</div>');
				fetchJobs(a.statuses, a.days).done(function (res) {
					var rows = (res && res.data) || [];
					list.empty();
					if (!rows.length) { list.html('<div class="kyoto-note">No jobs found' + (a.days !== null ? ' going out in the next ' + a.days + ' days.' : ' currently out.') + '</div>'); return; }
					$.each(rows, function (j, r) {
						var blocked = a.kind !== 3 && Number(r.STATUS) < 2;
						var row = $('<div>', { 'class': 'kyoto-job' + (blocked ? ' blocked' : '') }).appendTo(list);
						row.html('<span class="num">' + esc(r.NUMBER) + '</span><span class="name">' + esc(r.JOB_NAME || r.COMPANY || r.CLIENT) + '</span><span class="meta">' + esc(a.dateWord + ' ' + niceDate(r[a.dateKey])) + ' · ' + esc(statusName(r.STATUS)) + (blocked ? ' (book first)' : '') + '</span>');
						row.on('click', function () { window.location.href = blocked ? '/job.php?id=' + encodeURIComponent(r.NUMBER) : scanUrl(r.NUMBER, a.kind); });
					});
				}).fail(function () { list.html('<div class="kyoto-note">Could not load jobs. Use HireHop\'s own search below.</div>'); });
			});
		});
		$('<div>', { 'class': 'kyoto-btn', text: 'Stock check' }).appendTo(btns).on('click', function () {
			var tab = $('a[href="#stockckeck_tab"]').first();
			if (tab.length) tab[0].click();
		});
	}

	// ------------------------------------------------------------- job page
	function jobPage() {
		if (!/^\/job\.php/.test(path) || typeof window.job_id === 'undefined') return;
		var host = $('#job_buttons');
		if (!host.length) return;
		var bar = $('<div>', { id: 'kyoto_job_bar' }).insertAfter(host.closest('table').length ? host.closest('table') : host);
		function goScan(kind) {
			var st = window.job_data ? Number(window.job_data.STATUS) : 2;
			if (kind !== 3 && st < 2 && typeof window.save_status === 'function') {
				// HireHop will not scan a job that is not Booked. Use its own status change (it asks to confirm).
				window.save_status(2);
				return;
			}
			window.location.href = scanUrl(window.job_id, kind);
		}
		$('<div>', { 'class': 'kyoto-btn', text: 'Prep' }).appendTo(bar).on('click', function () { goScan(1); });
		$('<div>', { 'class': 'kyoto-btn', text: 'Scan out' }).appendTo(bar).on('click', function () { goScan(2); });
		$('<div>', { 'class': 'kyoto-btn', text: 'Scan in' }).appendTo(bar).on('click', function () { goScan(3); });
		$('<div>', { 'class': 'kyoto-btn', text: 'Carnet' }).appendTo(bar).on('click', function () {
			var win = window.open('', '_blank'); // opened on the click so the browser allows it
			$.getJSON('/php_functions/doc_list.php', { type: 1, sub_type: 0, main_id: window.job_id }).done(function (docs) {
				var list = $.isArray(docs) ? docs : (docs && (docs.data || docs.rows)) || [], doc = null;
				$.each(list, function (i, d) { if (/carnet/i.test(d.NAME || '')) { doc = d; return false; } });
				if (!doc) { if (win) win.close(); window.alert('No carnet document is installed (Settings > Documents > New > Job carnet).'); return; }
				var now = new Date(), tz = (typeof window.timezone === 'string' && window.timezone) || 'Europe/London';
				var url = '/modules/docmaker/merge-html.php?' + $.param({ main_id: window.job_id, type: 1, sub_id: 0, sub_type: 0, doc: doc.ID, local: ymd(now) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':00', tz: tz, format: 'html', stn: 0, or: 1, ps: 'a4', nums: 0, engine: 1 });
				if (win) win.location.href = url; else window.location.href = url;
			}).fail(function () { if (win) win.close(); });
		});
		// Plainer tab name
		$('a[href="#items_tab"]').each(function () { if ($.trim($(this).text()) === 'Supplying') $(this).text('Gear list'); });
	}

	// --------------------------------------------------------- scanning page
	function scanningPage() {
		if (!/^\/modules\/scanning(\/|$)/.test(path)) return;
		$(document.body).addClass('kyoto-scan');
		var flash = $('<div>', { id: 'kyoto_flash' }).appendTo(document.body), timer = null;
		function show(ok, text) {
			flash.removeClass('ok bad').addClass(ok ? 'ok' : 'bad').text(text).stop(true, true).show();
			window.clearTimeout(timer); timer = window.setTimeout(function () { flash.fadeOut(250); }, ok ? 1200 : 2600);
		}
		var tries = 0, wait = window.setInterval(function () {
			var el = $('.hh_scanning_app').first(), app = null;
			try { app = el.length ? el.scanning_app('instance') : null; } catch (e) {}
			if (++tries > 40) window.clearInterval(wait);
			if (!app || app.__kyoto) return;
			window.clearInterval(wait); app.__kyoto = true;
			// Wrap HireHop's own reporting functions; always call the original first.
			if (typeof app.show_error === 'function') {
				var se = app.show_error;
				app.show_error = function (msg) { var r = se.apply(this, arguments); try { show(false, $('<div>').html(String(msg || 'Not accepted')).text()); } catch (e) {} return r; };
			}
			if (typeof app.add_log_message === 'function') {
				var al = app.add_log_message;
				app.add_log_message = function (cmd) {
					var r = al.apply(this, arguments);
					try { var t = typeof this.msg_format === 'function' ? this.msg_format(cmd) : ''; show(true, '✓ ' + ($('<div>').html(String(t || 'Scanned')).text())); } catch (e) {}
					return r;
				};
			}
		}, 250);
	}

	// ------------------------------------------------------------------ run
	$(function () {
		if (typeof window.user === 'undefined') return; // not a logged-in HireHop page
		var on = isOn();
		safe('styles', addStyles);
		safe('toggle', function () { addToggle(on); });
		if (!on) return;
		$(document.body).addClass('kyoto-view');
		safe('home', homeQuickActions);
		safe('job', jobPage);
		safe('scanning', scanningPage);
	});

	window.kyotoView = { version: VERSION, isOn: isOn };
	if (window.console) console.log('Kyoto view ' + VERSION + ' loaded (' + (isOn() ? 'on' : 'off') + ')');
})();
