/*
 * Kyoto view - a per-device tidy-up layer for HireHop.
 *
 * A small "Kyoto view" switch (bottom-left) turns it on or off for this browser
 * only. Off = HireHop exactly as it comes. On = fewer menu entries and job tabs,
 * shortcut buttons on the home page and on jobs, and a phone-friendlier
 * Scanning page.
 *
 * It only hides, restyles and adds shortcuts. Anything that changes data goes
 * through HireHop's own functions and confirmations.
 */
(function () {
	'use strict';

	var VERSION = '0.3.0';
	var TESTED_API = 1.31;              // HireHop hh_api_version this was built against
	var KEY = 'kyoto_view_on';
	var KEY_DAYS = 'kyoto_view_days';
	var KEY_MAINT = 'kyoto_view_maint_tab';
	if (typeof window.jQuery === 'undefined') return;
	var $ = window.jQuery, path = window.location.pathname;
	if (/^\/settings\.php/.test(path) || /^\/login/.test(path)) return;

	// Main-menu entries hidden while Kyoto view is on (agreed with Craig, 19 Nov 2026)
	var HIDE_MENU_IDS = ['labour', 'consumables', 'resources', 'batch_invoicing', 'route_planner', 'driver_app', 'epos', 'depots'];
	var HIDE_MENU_URLS = ['/modules/warehouse/'];   // "Warehouse schedule" shares its id with "Scanning", so it is matched by address
	// Job tabs hidden while Kyoto view is on
	var HIDE_JOB_TABS = ['#files_tab', '#archives_tab', '#cal_tab', '#emails_tab'];
	var RANGES = [{ days: 1, label: 'Today and tomorrow' }, { days: 7, label: '7 days' }, { days: 14, label: '14 days' }];

	function store(k, v) { try { if (v === undefined) return window.localStorage.getItem(k); window.localStorage.setItem(k, v); } catch (e) { return null; } }
	function isOn() {
		var v = store(KEY);
		if (v === null) return !!(window.matchMedia && window.matchMedia('(max-width: 800px)').matches); // phones default to on
		return v === '1';
	}
	function setOn(on) { store(KEY, on ? '1' : '0'); window.location.reload(); }
	function safe(name, fn) { try { fn(); } catch (e) { if (window.console) console.log('Kyoto view: ' + name + ' skipped', e); } }
	function esc(s) { return $('<div>').text(s == null ? '' : String(s)).html(); }
	function pad(n) { return (n < 10 ? '0' : '') + n; }
	function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
	function stamp(d) { return ymd(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
	function parseDate(s) { if (!s) return null; var d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? null : d; }
	function niceDate(s) {
		var d = parseDate(s); if (!d) return '';
		return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
	}
	function tz() { return (typeof window.timezone === 'string' && window.timezone) || (window.Intl ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Europe/London'); }
	function scanUrl(jobId, kind) { return '/modules/scanning/?main_id=' + encodeURIComponent(jobId) + '&kind=' + kind; }
	function statusName(n) { try { return window.lang.statusValues[n] || ''; } catch (e) { return ''; } }
	function button(text, parent) { return $('<div>', { 'class': 'kyoto-btn', text: text }).appendTo(parent); }

	// ---------------------------------------------------------------- styles
	function addStyles() {
		var hide = $.map(HIDE_MENU_IDS, function (id) { return 'body.kyoto-view #header_nav_menu_' + id; })
			.concat($.map(HIDE_MENU_URLS, function (u) { return 'body.kyoto-view #header_nav_menu_container > li[data-url="' + u + '"]'; })).join(',');
		var css = [
			'#kyoto_view_toggle{position:fixed;left:8px;bottom:8px;z-index:99999;font:12px/1 sans-serif;padding:6px 10px;border-radius:14px;cursor:pointer;opacity:.55;background:#222;color:#fff;border:1px solid #666;user-select:none}',
			'#kyoto_view_toggle:hover{opacity:1}',
			'#kyoto_view_toggle.on{background:#b3123a;border-color:#b3123a;opacity:.8}',
			hide + '{display:none !important}',
			'.kyoto-qa{margin:0 0 12px 0;padding:10px;border-radius:8px;border:1px solid rgba(128,128,128,.4)}',
			'.kyoto-qa h3{margin:0 0 8px 0;font-size:1.05em;font-weight:600}',
			'.kyoto-qa h3.second{margin-top:12px}',
			'.kyoto-qa-btns{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}',
			'.kyoto-btn{display:block;padding:14px 10px;border-radius:8px;border:1px solid rgba(128,128,128,.5);background:rgba(128,128,128,.15);color:inherit;font-size:1.05em;font-weight:600;text-align:center;cursor:pointer}',
			'.kyoto-btn:hover,.kyoto-btn.active{background:#b3123a;color:#fff;border-color:#b3123a}',
			'.kyoto-btn.small{padding:9px 8px;font-size:.95em;font-weight:500}',
			'.kyoto-list{margin-top:10px}',
			'.kyoto-ranges{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px 0}',
			'.kyoto-pill{padding:5px 12px;border-radius:14px;border:1px solid rgba(128,128,128,.5);cursor:pointer;font-size:.9em}',
			'.kyoto-pill.active{background:#b3123a;color:#fff;border-color:#b3123a}',
			'.kyoto-filter{width:100%;box-sizing:border-box;padding:10px;margin:0 0 8px 0;font-size:16px;border-radius:6px;border:1px solid rgba(128,128,128,.5);background:rgba(128,128,128,.1);color:inherit}',
			'.kyoto-job{display:flex;gap:10px;align-items:center;padding:10px;border-radius:6px;border:1px solid rgba(128,128,128,.35);margin-bottom:6px;cursor:pointer}',
			'.kyoto-job:hover{background:rgba(128,128,128,.2)}',
			'.kyoto-job .num{font-weight:700;min-width:4.2em}',
			'.kyoto-job .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.kyoto-job .meta{opacity:.75;font-size:.9em;white-space:nowrap}',
			'.kyoto-job .late{color:#ff6b6b;font-weight:700;opacity:1}',
			'.kyoto-job.blocked{opacity:.6}',
			'.kyoto-note{opacity:.75;font-size:.9em;padding:6px 2px}',
			'#kyoto_job_bar{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 8px 0}',
			'#kyoto_job_bar .kyoto-btn{padding:10px 16px;font-size:1em}',
			'#kyoto_flash{position:fixed;left:0;right:0;top:0;z-index:99998;padding:18px 14px;font:700 20px/1.25 sans-serif;color:#fff;text-align:center;display:none;pointer-events:none}',
			'#kyoto_flash.ok{background:rgba(22,140,60,.95)}#kyoto_flash.bad{background:rgba(190,30,30,.96)}',
			'@media (max-width:800px){',
			' .kyoto-job{flex-wrap:wrap}.kyoto-job .name{flex-basis:60%;white-space:normal}.kyoto-job .meta{flex-basis:100%}',
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
		var now = new Date(), from = '';
		if (upToDays !== null) from = ymd(new Date(now.getTime() + upToDays * 86400000)) + ' 00:00:00';
		return $.ajax({
			url: '/php_functions/search_list.php', type: 'get', dataType: 'json',
			data: {
				pq_datatype: 'JSON', pq_sort: JSON.stringify([{ dataIndx: 'OUT_DATE', dir: 'up', dataType: 'date' }]),
				local: stamp(now), tz: tz(), page: 1, rows: 100, from_date: from, to_date: '', jobs: 1, projects: 0, open: 0, closed: 0, money_owed: 0,
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
		var btns = $('<div>', { 'class': 'kyoto-qa-btns' }).appendTo(box);
		$('<h3>', { 'class': 'second', text: 'Look up' }).appendTo(box);
		var btns2 = $('<div>', { 'class': 'kyoto-qa-btns' }).appendTo(box);
		var list = $('<div>', { 'class': 'kyoto-list' }).appendTo(box);
		var days = parseInt(store(KEY_DAYS), 10); if ([1, 7, 14].indexOf(days) < 0) days = 7;

		function clearActive() { box.find('.kyoto-btn').removeClass('active'); }

		// a: {label, statuses, ranged, kind (scan kind or 0 = open the job), dateKey, dateWord, lateOnly}
		function showJobs(a, btn) {
			clearActive(); btn.addClass('active'); list.empty();
			if (a.ranged) {
				var pills = $('<div>', { 'class': 'kyoto-ranges' }).appendTo(list);
				$.each(RANGES, function (i, r) {
					$('<div>', { 'class': 'kyoto-pill' + (r.days === days ? ' active' : ''), text: r.label }).appendTo(pills).on('click', function () { days = r.days; store(KEY_DAYS, String(days)); showJobs(a, btn); });
				});
			}
			var filterBox = null;
			if (a.filter) {
				filterBox = $('<input>', { type: 'text', 'class': 'kyoto-filter', placeholder: 'Type part of the job name, client or number' }).appendTo(list)
					.on('input', function () {
						var q = String($(this).val() || '').toLowerCase().trim();
						out.find('.kyoto-job').each(function () { $(this).toggle(q === '' || $(this).text().toLowerCase().indexOf(q) >= 0); });
					});
			}
			var out = $('<div>').appendTo(list).html('<div class="kyoto-note">Loading jobs…</div>');
			fetchJobs(a.statuses, a.ranged ? days : null).done(function (res) {
				var rows = (res && res.data) || [], now = new Date();
				if (a.lateOnly) rows = $.grep(rows, function (r) { var d = parseDate(r.RETURN_DATE); return d && d < now; });
				out.empty();
				if (!rows.length) { out.html('<div class="kyoto-note">' + esc(a.empty) + '</div>'); return; }
				$.each(rows, function (j, r) {
					var blocked = (a.kind === 1 || a.kind === 2) && Number(r.STATUS) < 2;
					var back = parseDate(r.RETURN_DATE), late = a.dateKey === 'RETURN_DATE' && back && back < now;
					var row = $('<div>', { 'class': 'kyoto-job' + (blocked ? ' blocked' : '') }).appendTo(out);
					row.html('<span class="num">' + esc(r.NUMBER) + '</span><span class="name">' + esc(r.JOB_NAME || r.COMPANY || r.CLIENT) + (a.filter && r.COMPANY ? ' <span class="meta">' + esc(r.COMPANY) + '</span>' : '') + '</span><span class="meta' + (late ? ' late' : '') + '">' +
						esc(a.dateWord + ' ' + niceDate(r[a.dateKey])) + (late ? ' · LATE' : '') + ' · ' + esc(statusName(r.STATUS)) + (blocked ? ' (book first)' : '') + '</span>');
					row.on('click', function () { window.location.href = (blocked || !a.kind) ? '/job.php?id=' + encodeURIComponent(r.NUMBER) : scanUrl(r.NUMBER, a.kind); });
				});
				if (filterBox) filterBox.trigger('focus');
			}).fail(function () { out.html('<div class="kyoto-note">Could not load jobs. Use HireHop\'s own search below.</div>'); });
		}

		var lists = [
			{ label: 'Prep a job', statuses: [1, 2, 3], ranged: true, kind: 1, dateKey: 'OUT_DATE', dateWord: 'out', empty: 'No jobs going out in that period.', row: btns },
			{ label: 'Scan a job out', statuses: [1, 2, 3, 4], ranged: true, kind: 2, dateKey: 'OUT_DATE', dateWord: 'out', empty: 'No jobs going out in that period.', row: btns },
			{ label: 'Scan a job in', statuses: [4, 5, 6], ranged: false, kind: 3, dateKey: 'RETURN_DATE', dateWord: 'back', empty: 'No jobs are marked as out.', row: btns }
		];
		$.each(lists, function (i, a) { var b = button(a.label, a.row); b.on('click', function () { showJobs(a, b); }); });
		button('Scan anything in', btns).on('click', function () {
			// HireHop's own "check all in": scan any returned item and it finds the job it went out on
			var depot = window.user && (window.user.root_depot_id || window.user.DEPOT_ID);
			if (depot) window.location.href = '/modules/scanning/?main_id=' + encodeURIComponent(depot) + '&kind=4';
			else if (typeof window.do_search === 'function') window.do_search('101');
		});
		button('Stock check', btns).on('click', function () { var tab = $('a[href="#stockckeck_tab"]').first(); if (tab.length) tab[0].click(); });

		var findA = { label: 'Find a job', statuses: [0, 1, 2, 3, 4, 5, 6, 8], ranged: false, kind: 0, dateKey: 'OUT_DATE', dateWord: 'out', filter: true, empty: 'No open jobs.' };
		(function () { var b = button(findA.label, btns2).addClass('small'); b.on('click', function () { showJobs(findA, b); }); })();
		button('New quote or job', btns2).addClass('small').on('click', function () { var b = document.getElementById('new_job_btn'); if (b) b.click(); });
		var outA = { label: 'What is out', statuses: [4, 5, 6], ranged: false, kind: 0, dateKey: 'RETURN_DATE', dateWord: 'back', empty: 'No jobs are marked as out.' };
		var lateA = $.extend({}, outA, { label: 'Late back', lateOnly: true, empty: 'Nothing is late back.' });
		$.each([outA, lateA], function (i, a) { var b = button(a.label, btns2).addClass('small'); b.on('click', function () { showJobs(a, b); }); });
		button('Find an item', btns2).addClass('small').on('click', function () {
			var code = window.prompt('Tag number or serial of the item (type it, or scan it with a handheld scanner):');
			code = code == null ? '' : String(code).trim();
			if (code === '' || typeof window.open_barcode !== 'function') return;
			$('#barcode').val(code); window.open_barcode();   // HireHop's own barcode search
		});
		button('PAT tests', btns2).addClass('small').on('click', function () { store(KEY_MAINT, 'Tests'); window.location.href = '/modules/maintenance/'; });
		button('Damaged / repairs', btns2).addClass('small').on('click', function () { store(KEY_MAINT, 'Damaged'); window.location.href = '/modules/maintenance/'; });

		// HireHop's own search panel stays, but closed until wanted
		safe('collapse search', function () {
			var acc = $('#accordion');
			if (acc.length && acc.hasClass('ui-accordion')) acc.accordion('option', 'collapsible', true).accordion('option', 'active', false);
		});
	}

	// ------------------------------------------------------- maintenance page
	function maintenancePage() {
		if (!/^\/modules\/maintenance(\/|$)/.test(path)) return;
		var want = store(KEY_MAINT); if (!want) return;
		try { window.localStorage.removeItem(KEY_MAINT); } catch (e) {}
		var tries = 0, t = window.setInterval(function () {
			var el = $('button, label, .ui-button').filter(function () { return $(this).is(':visible') && $(this).text().trim() === want; }).first();
			if (el.length) { window.clearInterval(t); el[0].click(); }
			else if (++tries > 20) window.clearInterval(t);
		}, 300);
	}

	// ------------------------------------------------------------- job page
	function openJobDocument(nameTest, missingMsg) {
		var win = window.open('', '_blank'); // opened on the click so the browser allows it
		$.getJSON('/php_functions/doc_list.php', { type: 1, sub_type: 0, main_id: window.job_id }).done(function (docs) {
			var all = Array.isArray(docs) ? docs : (docs && (docs.data || docs.rows)) || [], doc = null;
			$.each(all, function (i, d) { if (nameTest.test(d.NAME || '')) { doc = d; return false; } });
			if (!doc) { if (win) win.close(); window.alert(missingMsg); return; }
			var url = '/modules/docmaker/merge-html.php?' + $.param({ main_id: window.job_id, type: 1, sub_id: 0, sub_type: 0, doc: doc.ID, local: stamp(new Date()), tz: tz(), format: 'html', stn: 0, or: /carnet/i.test(doc.NAME) ? 1 : 0, ps: 'a4', nums: 0, engine: 1 });
			if (win) win.location.href = url; else window.location.href = url;
		}).fail(function () { if (win) win.close(); window.alert('Could not load the document list. Use HireHop\'s Print button.'); });
	}

	function jobPage() {
		if (!/^\/job\.php/.test(path) || typeof window.job_id === 'undefined') return;
		var host = $('#job_buttons');
		if (!host.length) return;
		var anchor = host.closest('table');
		var bar = $('<div>', { id: 'kyoto_job_bar' }).insertAfter(anchor.length ? anchor : host);
		function status() { return window.job_data ? Number(window.job_data.STATUS) : 2; }
		function goScan(kind) {
			if (kind !== 3 && status() < 2 && typeof window.save_status === 'function') {
				// HireHop will not scan a job that is not Booked. Use its own status change (it asks to confirm).
				window.save_status(2);
				return;
			}
			window.location.href = scanUrl(window.job_id, kind);
		}
		button('Prep', bar).on('click', function () { goScan(1); });
		button('Scan out', bar).on('click', function () { goScan(2); });
		button('Scan in', bar).on('click', function () { goScan(3); });
		button('Packing list', bar).on('click', function () { openJobDocument(/^packing list$/i, 'No "Packing list" document is installed.'); });
		button('Carnet', bar).on('click', function () { openJobDocument(/carnet/i, 'No carnet document is installed (Settings > Documents > New > Job carnet).'); });
		if (typeof window.save_status === 'function') {
			var book = button('Set to Booked', bar).on('click', function () { window.save_status(2); });
			var sync = function () { book.toggle(status() < 2); };
			sync(); window.setInterval(sync, 1500);   // HireHop updates job_data when the status changes
		}
		$.each(HIDE_JOB_TABS, function (i, href) { $('a[href="' + href + '"]').closest('li').hide(); });
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
		if (typeof window.hh_api_version === 'number' && window.hh_api_version > TESTED_API && window.console) {
			console.warn('Kyoto view ' + VERSION + ' was built for HireHop ' + TESTED_API + '; this is ' + window.hh_api_version + '. Check the shortcuts still work.');
		}
		var on = isOn();
		safe('styles', addStyles);
		safe('toggle', function () { addToggle(on); });
		if (!on) return;
		$(document.body).addClass('kyoto-view');
		safe('home', homeQuickActions);
		safe('maintenance', maintenancePage);
		safe('job', jobPage);
		safe('scanning', scanningPage);
	});

	window.kyotoView = { version: VERSION, isOn: isOn };
	if (window.console) console.log('Kyoto view ' + VERSION + ' loaded (' + (isOn() ? 'on' : 'off') + ')');
})();
