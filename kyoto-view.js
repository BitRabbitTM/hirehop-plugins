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

	var VERSION = '0.5.1';
	var TESTED_API = 1.31;              // HireHop hh_api_version this was built against
	var KEY = 'kyoto_view_on';
	var KEY_DAYS = 'kyoto_view_days';
	var KEY_MAINT = 'kyoto_view_maint_tab';
	if (typeof window.jQuery === 'undefined' || window.kyotoView) return;   // never run twice
	var $ = window.jQuery, path = window.location.pathname;
	if (/^\/settings\.php/.test(path) || /^\/login/.test(path)) return;

	// Main-menu entries hidden while Kyoto view is on (agreed with Craig, 19 Nov 2026)
	var HIDE_MENU_IDS = ['labour', 'consumables', 'resources', 'batch_invoicing', 'route_planner', 'driver_app', 'epos', 'depots'];
	var HIDE_MENU_URLS = ['/modules/warehouse/'];   // "Warehouse schedule" shares its id with "Scanning", so it is matched by address
	// Job tabs hidden while Kyoto view is on (the tab panels' ids)
	var HIDE_JOB_TABS = ['files_tab', 'archives_tab', 'cal_tab', 'emails_tab'];
	var RANGES = [{ days: 1, label: 'Today and tomorrow' }, { days: 7, label: '7 days' }, { days: 14, label: '14 days' }];

	function getStore(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
	function setStore(k, v) { try { window.localStorage.setItem(k, v); return window.localStorage.getItem(k) === v; } catch (e) { return false; } }
	function delStore(k) { try { window.localStorage.removeItem(k); } catch (e) {} }
	function isPhone() {
		try { return window.matchMedia('(pointer:coarse)').matches && Math.min(window.screen.width, window.screen.height) <= 800; } catch (e) { return false; }
	}
	// Decided once per browser and then remembered: on for phones, off for computers.
	function isOn() {
		var v = getStore(KEY);
		if (v === null) { v = isPhone() ? '1' : '0'; if (!setStore(KEY, v)) return false; }
		return v === '1';
	}
	function safe(name, fn) { try { fn(); } catch (e) { if (window.console) console.log('Kyoto view: ' + name + ' skipped', e); } }
	function esc(s) { return $('<div>').text(s == null ? '' : String(s)).html(); }
	// Decode HTML entities in server text without building any elements from it
	function decode(text) { var ta = document.createElement('textarea'); ta.innerHTML = String(text == null ? '' : text); return ta.value.trim(); }
	function plain(html) { return $('<div>').html(String(html == null ? '' : html)).text().trim(); }
	function pad(n) { return (n < 10 ? '0' : '') + n; }
	function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
	function stamp(d) { return ymd(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
	function parseDate(s) { if (!s) return null; var d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? null : d; }
	function niceDate(s) {
		var d = parseDate(s); if (!d) return '';
		return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] +
			(d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
	}
	function tz() { return (typeof window.timezone === 'string' && window.timezone) || (window.Intl ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Europe/London'); }
	// "Now" as HireHop writes dates (depot time zone), so late checks do not depend on where the phone is
	function nowStamp() {
		try {
			var p = {}, parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date());
			$.each(parts, function (i, x) { p[x.type] = x.value; });
			return p.year + '-' + p.month + '-' + p.day + ' ' + (p.hour === '24' ? '00' : p.hour) + ':' + p.minute + ':' + p.second;
		} catch (e) { return stamp(new Date()); }
	}
	function scanUrl(jobId, kind) { return '/modules/scanning/?main_id=' + encodeURIComponent(jobId) + '&kind=' + kind; }
	function statusName(n) { try { return window.lang.statusValues[n] || ''; } catch (e) { return ''; } }
	function errorText(code) { try { return isNaN(parseInt(code, 10)) ? plain(code) : (window.lang.error[code] || ''); } catch (e) { return ''; } }
	// Attributes are set with .attr(): jQuery's $('<input>', {...}) would call jQuery UI's autocomplete() for an "autocomplete" key
	function textField(placeholder) { return $('<input>').attr({ type: 'text', placeholder: placeholder, autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false' }).addClass('kyoto-filter'); }
	function button(text, parent) { return $('<div>', { 'class': 'kyoto-btn', text: text, role: 'button' }).appendTo(parent); }

	// ---------------------------------------------------------------- styles
	function addStyles() {
		var hide = $.map(HIDE_MENU_IDS, function (id) { return 'body.kyoto-view #header_nav_menu_' + id; })
			.concat($.map(HIDE_MENU_URLS, function (u) { return 'body.kyoto-view #header_nav_menu_container > li[data-url="' + u + '"]'; }))
			.concat($.map(HIDE_JOB_TABS, function (t) { return 'body.kyoto-view.kyoto-job-page li[role="tab"][aria-controls="' + t + '"]'; })).join(',');
		var css = [
			'#kyoto_view_toggle{position:fixed;left:8px;bottom:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:90;font:12px/1 sans-serif;padding:6px 10px;border-radius:14px;cursor:pointer;opacity:.55;background:#222;color:#fff;border:1px solid #666;user-select:none}',
			'#kyoto_view_toggle.on{background:#b3123a;border-color:#b3123a;opacity:.8}',
			'@media print{#kyoto_view_toggle,.kyoto-qa,#kyoto_job_bar,#kyoto_flash{display:none !important}}',
			hide + '{display:none !important}',
			'.kyoto-qa{margin:0 0 12px 0;padding:10px;border-radius:8px;border:1px solid rgba(128,128,128,.4)}',
			'.kyoto-qa h3{margin:0 0 8px 0;font-size:1.05em;font-weight:600}',
			'.kyoto-qa h3.second{margin-top:12px}',
			'.kyoto-qa-btns{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}',
			'.kyoto-btn{display:flex;align-items:center;justify-content:center;padding:14px 10px;border-radius:8px;border:1px solid rgba(128,128,128,.5);background:rgba(128,128,128,.15);color:inherit;font-size:1.05em;font-weight:600;text-align:center;cursor:pointer}',
			'.kyoto-btn.active{background:#b3123a;color:#fff;border-color:#b3123a}',
			'.kyoto-btn.small{padding:9px 8px;font-size:.95em;font-weight:500}',
			'.kyoto-list{margin-top:10px}',
			'.kyoto-ranges{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px 0}',
			'.kyoto-pill{padding:5px 12px;border-radius:14px;border:1px solid rgba(128,128,128,.5);cursor:pointer;font-size:.9em;display:flex;align-items:center}',
			'.kyoto-pill.active{background:#b3123a;color:#fff;border-color:#b3123a}',
			'.kyoto-row{display:flex;gap:8px;margin:0 0 8px 0}',
			'.kyoto-search{margin-bottom:12px}.kyoto-search .kyoto-btn{flex:0 0 auto;padding-left:18px;padding-right:18px}',
			'.kyoto-qa input.kyoto-filter{flex:1;min-width:0;box-sizing:border-box;padding:10px;font-size:16px;border-radius:6px;border:1px solid rgba(128,128,128,.5);background:rgba(128,128,128,.1);color:inherit}',
			'a.kyoto-job{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;padding:10px;border-radius:6px;border:1px solid rgba(128,128,128,.35);margin-bottom:6px;cursor:pointer;text-decoration:none;color:inherit}',
			'.kyoto-job .num{font-weight:700;min-width:4.2em}',
			'.kyoto-job .name{flex:1 1 12em;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.kyoto-job .meta{opacity:.75;font-size:.9em}',
			'.kyoto-job .late{color:#ff6b6b;font-weight:700;opacity:1}',
			'.kyoto-job.blocked{opacity:.6}',
			'.kyoto-note{opacity:.8;font-size:.9em;padding:6px 2px}',
			'#kyoto_job_bar{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 8px 0}',
			'#kyoto_job_bar .kyoto-btn{padding:10px 16px;font-size:1em}',
			'#kyoto_job_note{flex-basis:100%}',
			'#kyoto_kits{flex-basis:100%;display:flex;flex-wrap:wrap;gap:8px;align-items:center}#kyoto_kits .kyoto-note{flex-basis:100%}',
			'#kyoto_flash{position:fixed;left:0;right:0;top:0;z-index:99998;padding:18px 14px;font:700 20px/1.25 sans-serif;color:#fff;text-align:center;display:none;pointer-events:none}',
			'#kyoto_flash.ok{background:rgba(22,140,60,.95)}#kyoto_flash.bad{background:rgba(190,30,30,.96)}#kyoto_flash.ask{background:rgba(190,120,10,.96)}',
			'@media (hover:hover){#kyoto_view_toggle:hover{opacity:1}.kyoto-btn:hover{background:#b3123a;color:#fff;border-color:#b3123a}a.kyoto-job:hover{background:rgba(128,128,128,.2)}}',
			'@media (pointer:coarse){.kyoto-pill,.kyoto-btn.small,#kyoto_job_bar .kyoto-btn{min-height:44px;box-sizing:border-box}#kyoto_view_toggle{padding:12px 14px}}',
			'@media (max-width:800px),(pointer:coarse){',
			' .kyoto-job .name{flex-basis:60%;white-space:normal}.kyoto-job .meta{flex-basis:100%}',
			' body.kyoto-view.kyoto-scan .hh_scanning_app button,body.kyoto-view.kyoto-scan .hh_scanning_app .ui-button{min-height:44px;font-size:16px}',
			' body.kyoto-view.kyoto-scan .hh_scanning_app input[type=text],body.kyoto-view.kyoto-scan .hh_scanning_app select{min-height:40px;font-size:16px}',
			' body.kyoto-view.kyoto-scan .hh_scanning_app .pq-grid-cell{font-size:15px;padding-top:8px;padding-bottom:8px}',
			'}'
		].join('\n');
		$('<style>', { id: 'kyoto_view_css', text: css }).appendTo(document.head);
	}

	function addToggle(on) {
		if (/^\/modules\/scanning(\/|$)/.test(path)) return; // keep the scan box clear; switch from any other page
		$('<div>', { id: 'kyoto_view_toggle', 'class': on ? 'on' : '', role: 'button', title: 'Kyoto view ' + VERSION + ' - simplified HireHop for this device only. Click to switch.', text: 'Kyoto view: ' + (on ? 'ON' : 'OFF') })
			.appendTo(document.body).on('click', function () {
				if (!window.confirm('Switch Kyoto view ' + (on ? 'off' : 'on') + ' on this device? The page will reload.')) return;
				if (!setStore(KEY, on ? '0' : '1')) { window.alert('This browser will not save the setting, so Kyoto view cannot be switched here.'); return; }
				window.location.reload();
			});
	}

	// ------------------------------------------------------- home quick actions
	// opts: {sortKey, page, filter: {field, value}} - an empty statuses list means every status
	function fetchJobs(statuses, upToDays, opts) {
		opts = opts || {};
		var now = new Date(), from = '';
		if (upToDays !== null && upToDays !== undefined) from = ymd(new Date(now.getTime() + upToDays * 86400000)) + ' 00:00:00';
		var data = {
			pq_datatype: 'JSON', pq_sort: JSON.stringify([{ dataIndx: opts.sortKey || 'OUT_DATE', dir: 'down', dataType: 'date' }]),
			local: stamp(now), tz: tz(), page: opts.page || 1, rows: 100, from_date: from, to_date: '', jobs: 1, projects: 0, open: 0, closed: 0, money_owed: 0,
			is_late: 0, mine: 0, no_user: 0, needs_bill: 0, only_open_ended: 0, status: statuses.join(',')
		};
		// the same filter format HireHop's own results grid sends (one field per request; the server only supports AND)
		if (opts.filter) data.pq_filter = JSON.stringify({ mode: 'AND', data: [{ dataIndx: opts.filter.field, value: opts.filter.value, condition: 'contain', dataType: 'string', cbFn: '' }] });
		return $.ajax({ url: '/php_functions/search_list.php', type: 'get', dataType: 'json', timeout: 20000, data: data });
	}
	function badReply(res) { return !res || res.error !== undefined || !Array.isArray(res.data); }
	function byDate(key, newestFirst) { return function (x, y) { return String(x[key] || '').localeCompare(String(y[key] || '')) * (newestFirst ? -1 : 1); }; }
	// One job line. a: {kind (scan kind, or 0 = open the job), dateKey, dateWord, filter (also show the company)}
	function jobRow(out, r, a, now) {
		var st = Number(r.STATUS);
		var blocked = (a.kind === 1 || a.kind === 2) && st < 2;
		var late = a.dateKey === 'RETURN_DATE' && (st === 4 || st === 5 || st === 6) && r.RETURN_DATE && String(r.RETURN_DATE) < now;
		var href = (blocked || !a.kind) ? '/job.php?id=' + encodeURIComponent(r.NUMBER) : scanUrl(r.NUMBER, a.kind);
		var row = $('<a>', { 'class': 'kyoto-job' + (blocked ? ' blocked' : ''), href: href }).appendTo(out);
		row.data('q', [r.NUMBER, r.JOB_NAME, r.COMPANY, r.CLIENT].join(' ').toLowerCase());
		row.html('<span class="num">' + esc(r.NUMBER) + '</span><span class="name">' + esc(r.JOB_NAME || r.COMPANY || r.CLIENT) + '</span><span class="meta' + (late ? ' late' : '') + '">' +
			esc(a.dateWord + ' ' + niceDate(r[a.dateKey])) + (late ? ' · LATE' : '') + ' · ' + esc(statusName(r.STATUS)) + (blocked ? ' (book it first)' : '') +
			(a.filter && r.COMPANY ? ' · ' + esc(r.COMPANY) : '') + '</span>');
		return row;
	}

	function homeQuickActions() {
		if (!/^\/home\.php/.test(path)) return;
		var host = $('#search_tab .pane-left').first();
		if (!host.length) return;
		var box = $('<div>', { 'class': 'kyoto-qa' }).prependTo(host);
		var searchRow = $('<div>', { 'class': 'kyoto-row kyoto-search' }).appendTo(box);
		var searchBox = textField('Search jobs: name, client or number').attr('enterkeyhint', 'search').appendTo(searchRow);
		var searchBtn = button('Search', searchRow).addClass('small');
		$('<h3>', { text: 'Warehouse' }).appendTo(box);
		var btns = $('<div>', { 'class': 'kyoto-qa-btns' }).appendTo(box);
		$('<h3>', { 'class': 'second', text: 'Look up' }).appendTo(box);
		var btns2 = $('<div>', { 'class': 'kyoto-qa-btns' }).appendTo(box);
		var list = $('<div>', { 'class': 'kyoto-list' }).appendTo(box);
		var days = parseInt(getStore(KEY_DAYS), 10); if ([1, 7, 14].indexOf(days) < 0) days = 7;
		var loading = false;

		function select(btn) { box.find('.kyoto-btn').removeClass('active'); if (btn) btn.addClass('active'); list.empty().insertAfter(btn ? btns2 : searchRow); }
		function note(text) { return $('<div>', { 'class': 'kyoto-note', text: text }); }
		function openSearch() { safe('open search', function () { var acc = $('#accordion'); if (acc.accordion('instance')) acc.accordion('option', 'active', 0); }); }

		// a: {label, statuses, ranged, kind (scan kind, or 0 = open the job), dateKey, dateWord, lateOnly, filter, empty}
		function showJobs(a, btn) {
			if (loading) return;
			select(btn);
			if (a.ranged) {
				var pills = $('<div>', { 'class': 'kyoto-ranges' }).appendTo(list);
				$.each(RANGES, function (i, r) {
					$('<div>', { 'class': 'kyoto-pill' + (r.days === days ? ' active' : ''), text: r.label, role: 'button' }).appendTo(pills).on('click', function () { if (loading) return; days = r.days; setStore(KEY_DAYS, String(days)); showJobs(a, btn); });
				});
			}
			var filterBox = null, out = null;
			function applyFilter() {
				if (!filterBox) return;
				var q = String(filterBox.val() || '').toLowerCase().trim(), shown = 0;
				out.find('.kyoto-job').each(function () { var hit = q === '' || String($(this).data('q')).indexOf(q) >= 0; $(this).toggle(hit); if (hit) shown++; });
				out.find('.kyoto-nomatch').remove();
				if (!shown && out.find('.kyoto-job').length) note('No jobs match "' + q + '".').addClass('kyoto-nomatch').appendTo(out);
			}
			if (a.filter) filterBox = textField('Job name, client or number')
				.appendTo($('<div>', { 'class': 'kyoto-row' }).appendTo(list)).on('input', applyFilter);
			out = $('<div>').appendTo(list).append(note('Loading jobs…'));
			loading = true;
			fetchJobs(a.statuses, a.ranged ? days : null).done(function (res) {
				out.empty();
				if (badReply(res)) {
					var why = res && res.error !== undefined ? errorText(res.error) : '';
					note('Could not load jobs' + (why ? ' (' + why + ')' : '') + '. You may need to log in again.').appendTo(out); openSearch(); return;
				}
				var rows = res.data.slice(), now = nowStamp(), total = Number(res.totalRecords) || rows.length;
				if (a.lateOnly) rows = $.grep(rows, function (r) { return r.RETURN_DATE && String(r.RETURN_DATE) < now; });
				rows.sort(byDate(a.dateKey, !!a.filter));
				if (!rows.length) { note(a.empty).appendTo(out); return; }
				$.each(rows, function (j, r) { jobRow(out, r, a, now); });
				if (total > res.data.length) note('Showing the newest ' + res.data.length + ' of ' + total + ' jobs. Use the search box above to find any other job.').appendTo(out);
				applyFilter();
				if (filterBox && !isPhone()) filterBox.trigger('focus');
			}).fail(function () {
				out.empty().append(note('Could not load jobs. Check the connection and try again.'));
				button('Try again', out).addClass('small').on('click', function () { showJobs(a, btn); });
				openSearch();
			}).always(function () { loading = false; });
		}

		// Search every job, open or closed. HireHop filters one field per request, so ask for each in turn and merge.
		function runSearch() {
			if (loading) return;
			var q = String(searchBox.val() || '').trim();
			select(null);
			if (q.length < 2) { note('Type at least two letters, or a job number.').appendTo(list); return; }
			if (isPhone()) searchBox.trigger('blur');   // drop the keyboard so the results can be seen
			var out = $('<div>').appendTo(list).append(note('Searching…'));
			var found = {}, failed = 0, why = '', capped = false, steps = [], i = 0;
			// Count a failure; stop asking once the connection or HireHop itself is refusing
			function bad(res, stop) { failed++; if (res && res.error !== undefined && !why) why = errorText(res.error); if (stop) i = steps.length; }
			var a = { kind: 0, dateKey: 'OUT_DATE', dateWord: 'out', filter: true };
			function add(r) { var k = String(r.NUMBER); if (k && !found[k]) found[k] = r; }
			if (/^\d{1,9}$/.test(q)) steps.push(function () {
				return $.ajax({ url: '/php_functions/job_refresh.php', dataType: 'json', timeout: 15000, data: { job: q } }).done(function (j) {
					if (j && j.error === undefined && j.ID) add({ NUMBER: j.ID, JOB_NAME: j.JOB_NAME, COMPANY: j.COMPANY, CLIENT: j.NAME, STATUS: j.STATUS, OUT_DATE: j.OUT_DATE, RETURN_DATE: j.RETURN_DATE });
					else if (!j || (j.error !== undefined && Number(j.error) !== 7)) bad(j, j && Number(j.error) === 327);   // error 7 = no such job, an ordinary answer
				}).fail(function () { bad(null, true); });
			});
			$.each(['JOB_NAME', 'COMPANY', 'CLIENT'], function (n, field) {
				steps.push(function () {
					return fetchJobs([], null, { filter: { field: field, value: q } }).done(function (res) {
						if (badReply(res)) { bad(res, true); return; }
						if (Number(res.totalRecords) > res.data.length) capped = true;
						$.each(res.data, function (j, r) { add(r); });
					}).fail(function () { bad(null, true); });
				});
			});
			function finish() {
				loading = false;
				out.empty();
				var rows = $.map(found, function (r) { return r; }).sort(byDate('OUT_DATE', true)), now = nowStamp();
				if (!rows.length) note(failed ? 'The search could not be completed' + (why ? ' (' + why + ').' : '. Check the connection, or you may need to log in again.') : 'No jobs found for "' + q + '".').appendTo(out);
				else note(rows.length + (rows.length === 1 ? ' job' : ' jobs') + ' found, newest first. Closed jobs are included.').appendTo(out);
				if (capped) note('There are more than 100 matches, so older jobs are missing. Add more letters to narrow it down.').appendTo(out);
				if (failed && rows.length) note('Part of the search failed' + (why ? ' (' + why + ')' : '') + ', so some jobs may be missing.').appendTo(out);
				$.each(rows, function (j, r) { jobRow(out, r, a, now); });
				if (failed) button('Try again', out).addClass('small').on('click', runSearch);
			}
			function next() {
				if (i >= steps.length) { finish(); return; }
				steps[i++]().always(function () { window.setTimeout(next, i < steps.length ? 350 : 0); });   // spaced out to stay inside HireHop's rate limit
			}
			loading = true;
			next();
		}
		searchBtn.on('click', runSearch);
		searchBox.on('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });

		// Past jobs, most recently returned first. HireHop records no "closed on" date, so the return date is used.
		var PAST = [{ label: 'Finished', statuses: [7, 11], empty: 'No finished jobs.' }, { label: 'Cancelled / not interested', statuses: [9, 10], empty: 'No cancelled jobs.' }];
		function showPast(btn, group) {
			if (loading) return;
			group = group || PAST[0];
			select(btn);
			var pills = $('<div>', { 'class': 'kyoto-ranges' }).appendTo(list);
			$.each(PAST, function (n, g) {
				$('<div>', { 'class': 'kyoto-pill' + (g === group ? ' active' : ''), text: g.label, role: 'button' }).appendTo(pills).on('click', function () { showPast(btn, g); });
			});
			var out = $('<div>').appendTo(list), page = 0, shown = {}, count = 0;
			var a = { kind: 0, dateKey: 'RETURN_DATE', dateWord: 'back', filter: true };
			function more() {
				if (loading) return;
				loading = true; page++;
				out.find('.kyoto-more').remove();
				var wait = note('Loading jobs…').addClass('kyoto-more').appendTo(out);
				fetchJobs(group.statuses, null, { sortKey: 'RETURN_DATE', page: page }).done(function (res) {
					wait.remove();
					if (badReply(res)) {
						var why = res && res.error !== undefined ? errorText(res.error) : '';
						note('Could not load jobs' + (why ? ' (' + why + ')' : '') + '. You may need to log in again.').addClass('kyoto-more').appendTo(out);
						button('Try again', out).addClass('small kyoto-more').on('click', more);
						page--; return;
					}
					var now = nowStamp(), total = Number(res.totalRecords) || 0;
					$.each(res.data.slice().sort(byDate('RETURN_DATE', true)), function (j, r) {
						if (shown[r.NUMBER]) return;   // pages can overlap
						shown[r.NUMBER] = true; count++; jobRow(out, r, a, now);
					});
					if (!count) { note(group.empty).appendTo(out); return; }
					if (res.data.length && page * 100 < total) button('Show older jobs (' + count + ' of ' + total + ' shown)', out).addClass('small kyoto-more').on('click', more);
				}).fail(function () {
					wait.remove(); page--;
					note('Could not load jobs. Check the connection and try again.').addClass('kyoto-more').appendTo(out);
					button('Try again', out).addClass('small kyoto-more').on('click', more);
				}).always(function () { loading = false; });
			}
			more();
		}

		var lists = [
			{ label: 'Prep a job', statuses: [1, 2, 3], ranged: true, kind: 1, dateKey: 'OUT_DATE', dateWord: 'out', empty: 'No jobs going out in that period.' },
			{ label: 'Scan a job out', statuses: [1, 2, 3, 4], ranged: true, kind: 2, dateKey: 'OUT_DATE', dateWord: 'out', empty: 'No jobs going out in that period.' },
			{ label: 'Scan a job in', statuses: [4, 5, 6], ranged: false, kind: 3, dateKey: 'RETURN_DATE', dateWord: 'back', empty: 'No jobs are marked as out.' }
		];
		$.each(lists, function (i, a) { var b = button(a.label, btns); b.on('click', function () { showJobs(a, b); }); });
		button('Scan anything in', btns).on('click', function () {
			// HireHop's own "check all in": scan any returned item and it finds the job it went out on
			var depot = window.user && (window.user.root_depot_id || window.user.DEPOT_ID);
			if (depot) window.location.href = '/modules/scanning/?main_id=' + encodeURIComponent(depot) + '&kind=4';
			else if (typeof window.do_search === 'function') window.do_search('101');
			else { select(null); note('Scan anything in is not available for this login.').appendTo(list); }
		});
		button('Stock check', btns).on('click', function () {
			var tab = $('a[href="#stockckeck_tab"]').first();
			if (tab.length) tab[0].click(); else { select(null); note('Stock check is not available for this login.').appendTo(list); }
		});

		var findA = { label: 'Find a job', statuses: [0, 1, 2, 3, 4, 5, 6, 8], ranged: false, kind: 0, dateKey: 'OUT_DATE', dateWord: 'out', filter: true, empty: 'No open jobs.' };
		var outA = { label: 'What is out', statuses: [4, 5, 6], ranged: false, kind: 0, dateKey: 'RETURN_DATE', dateWord: 'back', empty: 'No jobs are marked as out.' };
		var lateA = $.extend({}, outA, { label: 'Late back', lateOnly: true, empty: 'Nothing is late back.' });
		(function () { var b = button(findA.label, btns2).addClass('small'); b.on('click', function () { showJobs(findA, b); }); })();
		(function () { var b = button('Past jobs', btns2).addClass('small'); b.on('click', function () { showPast(b); }); })();
		button('New quote or job', btns2).addClass('small').on('click', function () {
			var b = document.getElementById('new_job_btn');
			if (b) b.click(); else { select(null); note('New job is not available for this login.').appendTo(list); }
		});
		$.each([outA, lateA], function (i, a) { var b = button(a.label, btns2).addClass('small'); b.on('click', function () { showJobs(a, b); }); });
		var findItem = button('Find an item', btns2).addClass('small').on('click', function () {
			select(findItem);
			if (typeof window.open_barcode !== 'function' || !$('#barcode').length) { note('Item search is not available on this page.').appendTo(list); return; }
			var row = $('<div>', { 'class': 'kyoto-row' }).appendTo(list);
			var field = textField('Tag number or serial number').attr('enterkeyhint', 'search').appendTo(row);
			var go = function () { var code = String(field.val() || '').trim(); if (code === '') return; $('#barcode').val(code); window.open_barcode(); };   // HireHop's own tag search
			field.on('keydown', function (e) { if (e.key === 'Enter') go(); });
			button('Find', row).addClass('small').on('click', go);
			note('Type the number on the tag, or scan it with a handheld scanner. If the item is out, this opens the job it is on.').appendTo(list);
			field.trigger('focus');
		});
		button('PAT tests', btns2).addClass('small').on('click', function () { setStore(KEY_MAINT, 'Tests|' + new Date().getTime()); window.location.href = '/modules/maintenance/'; });
		button('Damaged / repairs', btns2).addClass('small').on('click', function () { setStore(KEY_MAINT, 'Damaged|' + new Date().getTime()); window.location.href = '/modules/maintenance/'; });

		// HireHop's own search panel stays, but closed until wanted
		var tries = 0, t = window.setInterval(function () {
			var acc = $('#accordion'), ready = false;
			try { ready = acc.length && !!acc.accordion('instance'); } catch (e) {}
			if (ready) { window.clearInterval(t); safe('collapse search', function () { acc.accordion('option', 'collapsible', true).accordion('option', 'active', false); }); }
			else if (++tries > 20) window.clearInterval(t);
		}, 250);
	}

	// ------------------------------------------------------- maintenance page
	function maintenancePage() {
		if (!/^\/modules\/maintenance(\/|$)/.test(path)) return;
		var flag = String(getStore(KEY_MAINT) || '').split('|'); delStore(KEY_MAINT);
		if (flag.length !== 2 || new Date().getTime() - Number(flag[1]) > 15000) return;   // only straight after a Kyoto button
		var want = flag[0], tries = 0, t = window.setInterval(function () {
			var el = $('button').filter(function () { return $(this).is(':visible') && $(this).text().trim() === want; });
			if (el.length === 1) { window.clearInterval(t); el[0].click(); }
			else if (++tries > 20) window.clearInterval(t);
		}, 300);
	}

	// ------------------------------------------------------------- job page
	function openJobDocument(nameTest, label, missingMsg) {
		var win = window.open('', '_blank'); // opened on the tap so the browser allows it
		if (win) { try { win.document.write('<p style="font:16px sans-serif;padding:24px">Loading ' + esc(label) + '…</p>'); } catch (e) {} }
		var giveUp = function (msg) { if (win && !win.closed) win.close(); window.alert(msg); };
		$.ajax({ url: '/php_functions/doc_list.php', dataType: 'json', timeout: 15000, data: { type: 1, sub_type: 0, main_id: window.job_id } }).done(function (docs) {
			var all = Array.isArray(docs) ? docs : (docs && Array.isArray(docs.data) ? docs.data : null), doc = null;
			if (!all) { giveUp('Could not load the document list. Use HireHop\'s Print button.'); return; }
			$.each(all, function (i, d) { if (nameTest.test(d.NAME || '')) { doc = d; return false; } });
			if (!doc) { giveUp(missingMsg); return; }
			var url = '/modules/docmaker/merge-html.php?' + $.param({ main_id: window.job_id, type: 1, sub_id: 0, sub_type: 0, doc: doc.ID, local: stamp(new Date()), tz: tz(), format: 'html', stn: 0, or: /carnet/i.test(doc.NAME) ? 1 : 0, ps: 'a4', nums: 0, engine: 1 });
			if (win && !win.closed) win.location.href = url; else window.location.href = url;
		}).fail(function () { giveUp('Could not load the document list. Use HireHop\'s Print button.'); });
	}

	function jobPage() {
		if (!/^\/job\.php/.test(path) || typeof window.job_id === 'undefined') return;
		var host = $('#job_buttons');
		if (!host.length) return;
		$(document.body).addClass('kyoto-job-page');
		var anchor = host.closest('table');
		var bar = $('<div>', { id: 'kyoto_job_bar' }).insertAfter(anchor.length ? anchor : host);
		var noteEl = null;
		function say(text) { if (noteEl) noteEl.remove(); noteEl = $('<div>', { id: 'kyoto_job_note', 'class': 'kyoto-note', text: text }).appendTo(bar); }
		function status() { return window.job_data && window.job_data.STATUS !== undefined ? Number(window.job_data.STATUS) : null; }
		function goScan(kind) {
			var st = status();
			if (st === null) { say('The job is still loading. Try again in a moment.'); return; }
			if (kind !== 3 && st < 2) { say('This job is ' + statusName(st) + '. HireHop only scans jobs that are Booked: tap "Set to Booked" first.'); return; }
			window.location.href = scanUrl(window.job_id, kind);
		}
		button('Prep', bar).on('click', function () { goScan(1); });
		button('Scan out', bar).on('click', function () { goScan(2); });
		button('Scan in', bar).on('click', function () { goScan(3); });
		button('Packing list', bar).on('click', function () { openJobDocument(/^packing list$/i, 'the packing list', 'No "Packing list" document is installed.'); });
		button('Carnet', bar).on('click', function () { openJobDocument(/carnet/i, 'the carnet', 'No carnet document is installed (Settings > Documents > New > Job carnet).'); });
		button('Add a kit', bar).on('click', function () { showKits(); });
		if (typeof window.save_status === 'function') {
			var book = button('Set to Booked', bar).on('click', function () { window.save_status(2); });   // HireHop asks to confirm
			// Prepped items go out with the job when it is set to Dispatched (tested 20 Nov 2026); items never prep-scanned are not tracked
			var disp = button('Set to Dispatched', bar).on('click', function () { window.save_status(5); });   // HireHop asks to confirm
			var sync = function () {
				var st = status();
				book.toggle(st !== null && st < 2); disp.toggle(st === 3);
				if (noteEl && st !== null && st >= 2) { noteEl.remove(); noteEl = null; }
			};
			sync(); window.setInterval(sync, 1500);   // HireHop updates job_data when the status changes
		}

		// ---- Add a kit. Kyoto's kits are "virtual" stock items (a name that pulls in its contents), not HireHop packages.
		// The button lists them, then opens HireHop's own "Add listed items" picker already searched for the chosen kit.
		var kitBox = null, kitsLoading = false, kitCache = null, picking = false;
		function loadKits() {
			var d = $.Deferred(), kits = [], page = 1;
			// kept in page memory for five minutes only, so a renamed or new kit shows up after a reload
			if (kitCache && Math.abs(new Date().getTime() - kitCache.t) < 300000) return d.resolve(kitCache.kits).promise();
			(function next() {
				$.ajax({ url: '/modules/stock/list.php', dataType: 'json', timeout: 20000, data: { pq_datatype: 'JSON', del: 0, rows: 200, USE_CATEGORY_TREE: 1, cats: '[]', show_hidden: 0, inc_virtual: 1, page: page } }).done(function (res) {
					if (badReply(res)) { d.reject(res && res.error !== undefined ? errorText(res.error) : ''); return; }
					$.each(res.data, function (i, r) { if (Number(r.VIRTUAL) === 1) { var kt = decode(r.TITLE); if (kt) kits.push(kt); } });
					if (res.data.length === 200 && page < 10) { page++; window.setTimeout(next, 400); return; }
					kits.sort(function (x, y) { return x.localeCompare(y); });
					kitCache = { t: new Date().getTime(), kits: kits };
					d.resolve(kits);
				}).fail(function () { d.reject(''); });
			})();
			return d.promise();
		}
		function showKits() {
			if (kitBox) { kitBox.remove(); kitBox = null; return; }   // second tap closes it
			kitBox = $('<div>', { id: 'kyoto_kits' }).appendTo(bar).append($('<div>', { 'class': 'kyoto-note', text: 'Loading kits…' }));
			if (kitsLoading) return;   // a load is already on its way and will fill this box
			kitsLoading = true;
			loadKits().done(function (kits) {
				if (!kitBox) return;
				kitBox.empty();
				if (!kits.length) { $('<div>', { 'class': 'kyoto-note', text: 'No kits are set up in the stock list yet.' }).appendTo(kitBox); return; }
				$('<div>', { 'class': 'kyoto-note', text: 'Pick a kit. HireHop\'s item picker opens searched for its name: choose the row with the arrow, set the quantity, then Save. Nothing is added until you press Save.' }).appendTo(kitBox);
				$.each(kits, function (i, title) { button(title, kitBox).addClass('small').on('click', function () { pickKit(title); }); });
			}).fail(function (why) {
				if (!kitBox) return;
				kitBox.empty().append($('<div>', { 'class': 'kyoto-note', text: 'Could not load the kits' + (why ? ' (' + why + ')' : '') + '. Use Supplying > New > Add listed items.' }));
			}).always(function () { kitsLoading = false; });
		}
		// HireHop's picker search hangs on some symbols (an "&", as in "D&B", never returns), so search on the longest plain run of the name
		function safeTerm(title) {
			var best = '';
			$.each(String(title).split(/[^A-Za-z0-9 .\-]+/), function (i, part) { part = String(part).trim(); if (part.length > best.length) best = part; });
			return best || String(title);
		}
		function pickKit(title) {
			if (picking) return;   // one pick at a time
			var manual = 'Open Supplying > New > Add listed items and search for "' + title + '".';
			var locked = 'HireHop is not letting items be added to this job (it may be locked, closed or read-only).';
			var tab = $('li[role="tab"] a[href="#items_tab"]').first();
			if (!tab.length) { window.alert(manual); return; }
			tab[0].click();
			picking = true;
			var tries = 0, opened = false, w = null, t = null, term = safeTerm(title);
			function stop(msg) { window.clearInterval(t); picking = false; if (msg) window.alert(msg); }
			t = window.setInterval(function () {
				tries++;
				if (!opened) {
					try { w = $('#items_tab').data('customItems'); } catch (e) { w = null; }
					var item = w && w.imenu_new_listed;
					if (item && item.length && !item.hasClass('ui-state-disabled')) {
						opened = true; tries = 0;
						try { w.picklist_dlg.find('input[type="search"]').first().val(term); } catch (e) {}   // so the picker's own first load is already on the kit
						item.trigger('click');   // HireHop's own "Add listed items"
					} else if (tries > 24 || (w && tries > 8)) stop(w ? locked : manual);
					return;
				}
				var dlg = $('.ui-dialog:visible').has('input.picklist_type'), box = dlg.find('input[type="search"]').first(), ready = false;
				if (box.length) {
					// Wait until the picker's own list request has finished; a search sent before that is overwritten by it
					try { var xhr = dlg.find('.hh_picklist_dlg').hh_picklist_dlg('get_grid').pqGrid('getXHR'); ready = !!xhr && xhr.readyState === 4; }
					catch (e) { ready = tries > 4 && dlg.find('.grid_container .pq-grid-cell').length > 0; }
				}
				if (box.length && (ready || tries > 80)) {
					stop();
					window.setTimeout(function () { box.val(term).trigger($.Event('keyup', { which: 13, keyCode: 13, key: 'Enter' })); }, 300);   // runs the picker's own search
				} else if (!box.length && tries > 24) stop(manual);
			}, 250);
		}
		// If the job opened on a tab that is now hidden, go back to the first tab
		safe('tabs', function () {
			var active = $('li[role="tab"][aria-selected="true"]').attr('aria-controls');
			if (active && HIDE_JOB_TABS.indexOf(active) >= 0) { var first = $('li[role="tab"] a').first(); if (first.length) first[0].click(); }
		});
	}

	// --------------------------------------------------------- scanning page
	function scanningPage() {
		if (!/^\/modules\/scanning(\/|$)/.test(path)) return;
		$(document.body).addClass('kyoto-scan');
		var flash = $('<div>', { id: 'kyoto_flash' }).appendTo(document.body), timer = null, badUntil = 0;
		function show(kind, text) {   // kind: 'ok' | 'bad' | 'ask'
			var now = new Date().getTime();
			if (kind === 'ok' && now < badUntil) return;          // never let a tick cover a refusal
			if (kind !== 'ok') badUntil = now + 2600;
			flash.removeClass('ok bad ask').addClass(kind).text(text).stop(true, true).show();
			window.clearTimeout(timer); timer = window.setTimeout(function () { flash.fadeOut(250); }, kind === 'ok' ? 1200 : 2600);
		}
		function describe(cmd) {
			var msg = plain(cmd.message);
			if (msg !== '') return msg;
			var qty = Number(cmd.qty), title = plain(cmd.title || cmd.TITLE), code = plain(cmd.barcode);
			return (qty > 1 ? qty + ' x ' : '') + title + (code ? ' (' + code + ')' : '');
		}
		var tries = 0, wait = window.setInterval(function () {
			var el = $('.hh_scanning_app').first(), app = null;
			try { app = el.length ? el.scanning_app('instance') : null; } catch (e) {}
			if (++tries > 40) window.clearInterval(wait);
			if (!app || app.__kyoto) return;
			window.clearInterval(wait); app.__kyoto = true;
			// Wrap HireHop's own reporting functions; always call the original first and never change what it is given.
			if (typeof app.show_error === 'function') {
				var se = app.show_error;
				app.show_error = function (msg) { var r = se.apply(this, arguments); try { show('bad', plain(msg) || 'Not accepted'); } catch (e) {} return r; };
			}
			if (typeof app.add_log_message === 'function') {
				var al = app.add_log_message;
				app.add_log_message = function (cmd) {
					var r = al.apply(this, arguments);
					try {
						if (cmd && typeof cmd === 'object') {
							var mine = cmd.user_id === undefined || !window.user || window.user.ID === undefined || String(cmd.user_id) === String(window.user.ID);
							if (cmd.cmd === 'error') show('bad', describe(cmd) || 'Not accepted');
							else if (cmd.cmd === 'confirm' || cmd.cmd === 'notice') show('ask', describe(cmd) || 'Check the screen');
							else if (cmd.cmd === 'success' && mine) show('ok', '✓ ' + (describe(cmd) || 'Scanned'));
						}
					} catch (e) {}
					return r;
				};
			}
		}, 250);
	}

	// ------------------------------------------------------------------ run
	window.kyotoView = { version: VERSION, isOn: isOn };
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
	if (window.console) console.log('Kyoto view ' + VERSION + ' loaded');
})();
