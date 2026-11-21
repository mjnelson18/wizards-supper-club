/**
 * GREAT COUNCIL OF WIZARDS — reusable score form
 *
 * One permanent form for every future evening. It does two jobs:
 *   - "Record a new evening": the chooser fills this in once after the meal
 *     (restaurant, date, who was there). It adds the evening to the Evenings
 *     tab and a row per wizard to the Log tab (TBC if there, DNA if not).
 *   - "Score an evening": each wizard picks the evening and gives a score.
 *     It updates that wizard's row in the Log tab.
 * A few minutes after any submission it asks GitHub to rebuild the website
 * (only if you have stored a token; see step 5).
 *
 * HOW TO SET UP (once, at a computer)
 * 1. Open https://script.google.com and open the project that holds the
 *    catch-up form script.
 * 2. Press + next to Files → Script, name it ScoreForm, delete the sample
 *    code, paste this whole file and save.
 * 3. Choose `setupScoreForm` in the function dropdown and press Run. Allow
 *    the permissions it asks for (it now also needs to call GitHub).
 * 4. Open the execution log. It shows the form's share link: pin that in
 *    WhatsApp. The same link is used for every evening from now on.
 * 5. Optional, for near-instant website updates: create a fine-grained GitHub
 *    token limited to the website repo with "Contents: Read and write", then
 *    Project Settings → Script properties → add GITHUB_TOKEN with the token.
 *    Without it the website still updates within 6 hours.
 *
 * If you would rather keep it in a separate project, paste the Sheet's ID
 * (the long code in its web address) into SF_SHEET_ID below first.
 *
 * Run `setupScoreForm` once only; a second run just prints the existing
 * links. If you edit the Evenings tab by hand, the form's list of evenings
 * updates itself; `refreshScoreForm` does the same on demand.
 *
 * When the roster changes, update SF_WIZARDS here and config/wizards.json in
 * the website repo, then run `refreshScoreForm`.
 */

// Display name in the form → name used in the Sheet. Current members only.
var SF_WIZARDS = [
  ['Calum', 'Calum'], ['Charlie', 'Charles'], ['Craig', 'Craig'], ['Dan', 'Daniel'], ['James', 'James'],
  ['Mike', 'Michael'], ['Tom', 'Thomas'], ['Jonny', 'Jonathan'], ['Dyson', 'Jeremy']
];

var SF_SHEET_ID = '';                               // only needed in a separate project
var SF_REPO = 'mjnelson18/wizards-supper-club';     // website repo to rebuild
var SF_SOURCE = 'Score form';                       // written to the Log's Source column
var SF_RECENT = 15;                                 // evenings offered for scoring, newest first
var SF_PING_DELAY_MIN = 7;                          // published CSVs lag the Sheet by a few minutes

var SF_ACTION = {
  SCORE: 'Score an evening',
  NEW: 'Record a new evening (the chooser does this once, after the meal)'
};
var SF_THERE = {
  SCORE: "I was there – here's my score",
  AVERAGE: "I was there – give me the evening's average",
  ABSENT: "I wasn't there"
};

var SF_EVENINGS_HEADER = ['Evening ID', 'Circuit', 'No. in circuit', 'Date', 'Chooser', 'Restaurant'];
var SF_LOG_HEADER = ['Evening ID', 'Wizard', 'Status', 'Score', 'Source', 'Updated', 'Review / note'];
var SF_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------- setup

function setupScoreForm() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SF_FORM_ID')) {
    var existing = FormApp.openById(props.getProperty('SF_FORM_ID'));
    Logger.log('Already set up. Nothing was created.');
    Logger.log('Form (share): ' + existing.getPublishedUrl());
    Logger.log('Form (edit): ' + existing.getEditUrl());
    return;
  }

  var ss = sfSpreadsheet_();
  sfCheckSheet_(ss);
  var names = SF_WIZARDS.map(function (w) { return w[0]; });

  var form = FormApp.create('Wizards: score the evening');
  form.setDescription('One link for every Council. Score an evening you went to, or, if you chose the ' +
    'restaurant, record the evening first so the others can score it.');
  form.setCollectEmail(false);

  var action = form.addMultipleChoiceItem().setTitle('What are you here to do?').setRequired(true);

  // --- Score an evening
  var pScore = form.addPageBreakItem().setTitle('Score an evening');
  var evening = form.addListItem().setTitle('Which evening?').setRequired(true);
  var who = form.addListItem().setTitle('Which Maester are you?').setRequired(true).setChoiceValues(names);
  var there = form.addMultipleChoiceItem().setTitle('Were you there?').setRequired(true);

  var pMark = form.addPageBreakItem().setTitle('Your score');
  var score = form.addTextItem().setTitle('Score out of 10')
    .setHelpText('Any number from 0 to 10. Decimals allowed, e.g. 7.5.')
    .setRequired(true)
    .setValidation(FormApp.createTextValidation().setHelpText('A number from 0 to 10.').requireNumberBetween(0, 10).build());
  var review = form.addParagraphTextItem().setTitle('Anything to add? A review, a grievance (optional)')
    .setHelpText('Kept in the private sheet. Never shown on the website.');

  // --- Record a new evening
  var pNew = form.addPageBreakItem().setTitle('Record a new evening')
    .setHelpText('Once per evening, by whoever chose the restaurant. Everyone ticked below is then asked for a score.');
  pNew.setGoToPage(FormApp.PageNavigationType.SUBMIT); // the "Your score" page ends the form
  var restaurant = form.addTextItem().setTitle('Restaurant').setRequired(true)
    .setValidation(FormApp.createTextValidation().setHelpText('Keep it to 80 characters.').requireTextLengthLessThanOrEqualTo(80).build());
  var date = form.addDateItem().setTitle('When was it?').setRequired(true);
  var chooser = form.addListItem().setTitle('Who chose it?').setRequired(true).setChoiceValues(names);
  var circuit = form.addListItem().setTitle('Which circuit does it count towards?').setRequired(true);
  var present = form.addCheckboxItem().setTitle('Who was there?')
    .setHelpText('Tick every wizard who came. Leave guests out. The chooser is counted automatically.')
    .setRequired(true).setChoiceValues(names);

  action.setChoices([
    action.createChoice(SF_ACTION.SCORE, pScore),
    action.createChoice(SF_ACTION.NEW, pNew)
  ]);
  there.setChoices([
    there.createChoice(SF_THERE.SCORE, pMark),
    there.createChoice(SF_THERE.AVERAGE, FormApp.PageNavigationType.SUBMIT),
    there.createChoice(SF_THERE.ABSENT, FormApp.PageNavigationType.SUBMIT)
  ]);

  props.setProperty('SF_FORM_ID', form.getId());
  props.setProperty('SF_ITEMS', JSON.stringify({
    action: action.getId(), evening: evening.getId(), who: who.getId(), there: there.getId(),
    score: score.getId(), review: review.getId(), restaurant: restaurant.getId(), date: date.getId(),
    chooser: chooser.getId(), circuit: circuit.getId(), present: present.getId()
  }));

  refreshScoreForm();
  ScriptApp.newTrigger('onScoreFormSubmit').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('sfOnSheetEdit').forSpreadsheet(ss).onEdit().create();

  Logger.log('Form (share – pin this in WhatsApp): ' + form.getPublishedUrl());
  Logger.log('Form (edit): ' + form.getEditUrl());
  Logger.log('Sheet: ' + ss.getUrl());
}

/** Rebuild the form's list of evenings and circuits from the Evenings tab. */
function refreshScoreForm() {
  var props = PropertiesService.getScriptProperties();
  var ids = JSON.parse(props.getProperty('SF_ITEMS'));
  var form = FormApp.openById(props.getProperty('SF_FORM_ID'));
  var evenings = sfEvenings_(sfSpreadsheet_());
  var names = SF_WIZARDS.map(function (w) { return w[0]; });
  var labels = sfEveningLabels_(evenings);

  form.getItemById(ids.evening).asListItem().setChoiceValues(labels.length ? labels : ['No evenings recorded yet']);
  form.getItemById(ids.circuit).asListItem().setChoiceValues(sfCircuitChoices_(evenings));
  form.getItemById(ids.who).asListItem().setChoiceValues(names);
  form.getItemById(ids.chooser).asListItem().setChoiceValues(names);
  form.getItemById(ids.present).asCheckboxItem().setChoiceValues(names);
}

// ---------------------------------------------------------------- triggers

/** Runs on every submission. Writes straight into the Evenings and Log tabs. */
function onScoreFormSubmit(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ids = JSON.parse(PropertiesService.getScriptProperties().getProperty('SF_ITEMS'));
    var byItem = {};
    e.response.getItemResponses().forEach(function (ir) {
      byItem[String(ir.getItem().getId())] = ir.getResponse();
    });
    var answers = {};
    Object.keys(ids).forEach(function (key) { answers[key] = byItem[String(ids[key])]; });

    var result = sfApply_(sfSpreadsheet_(), answers, new Date());
    Logger.log(result.message);
    if (result.changed) {
      if (answers.action === SF_ACTION.NEW) refreshScoreForm();
      sfQueuePing_();
    }
  } finally {
    lock.releaseLock();
  }
}

/** Keeps the form's lists in step when the Evenings tab is edited by hand. */
function sfOnSheetEdit(e) {
  if (e && e.range && e.range.getSheet().getName() === 'Evenings') refreshScoreForm();
}

// ---------------------------------------------------------------- the work

/**
 * Apply one submission to the Sheet. Returns { changed, message }.
 * Never deletes anything; it only updates a wizard's own row or adds rows.
 */
function sfApply_(ss, a, now) {
  if (a.action === SF_ACTION.NEW) return sfRecordEvening_(ss, a, now);
  if (a.action === SF_ACTION.SCORE) return sfRecordScore_(ss, a, now);
  return { changed: false, message: 'Ignored: unknown action' };
}

function sfRecordScore_(ss, a, now) {
  var id = String(a.evening || '').split(' ')[0];
  var person = sfSheetName_(a.who);
  if (!/^C\d+-\d{2}$/.test(id) || !person) return { changed: false, message: 'Ignored: no evening or wizard' };
  if (!sfEvenings_(ss).some(function (ev) { return ev.id === id; })) {
    return { changed: false, message: 'Ignored: ' + id + ' is not in the Evenings tab' };
  }

  var status, score = '';
  if (a.there === SF_THERE.ABSENT) status = 'DNA';
  else if (a.there === SF_THERE.AVERAGE) status = 'Average';
  else {
    score = Math.round(Number(a.score) * 100) / 100;
    if (a.score === undefined || String(a.score).trim() === '' || !(score >= 0 && score <= 10)) {
      return { changed: false, message: 'Ignored: score must be 0 to 10, got "' + a.score + '"' };
    }
    status = 'Scored';
  }

  var log = ss.getSheetByName('Log');
  var data = log.getDataRange().getValues();
  var row = 0;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id && data[i][1] === person) { row = i + 1; break; }
  }
  var review = sfText_(a.review);
  if (row) {
    log.getRange(row, 3, 1, 4).setValues([[status, score, SF_SOURCE, now]]);
    if (review) log.getRange(row, 7).setValue(review);
  } else {
    log.appendRow([id, person, status, score, SF_SOURCE, now, review]);
  }
  return { changed: true, message: id + ' ' + person + ': ' + status + (status === 'Scored' ? ' ' + score : '') };
}

function sfRecordEvening_(ss, a, now) {
  var name = sfCleanName_(a.restaurant);
  var iso = String(a.date || '');
  var chooser = sfSheetName_(a.chooser);
  var circuit = parseInt(a.circuit, 10);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || !chooser || !(circuit >= 1)) {
    return { changed: false, message: 'Ignored: new evening is missing a restaurant, date, chooser or circuit' };
  }

  var evenings = sfEvenings_(ss);
  var twin = evenings.filter(function (ev) { return ev.date === iso && ev.restaurant.toLowerCase() === name.toLowerCase(); })[0];
  if (twin) return { changed: false, message: 'Ignored: already recorded as ' + twin.id };

  var number = 1;
  evenings.forEach(function (ev) { if (ev.circuit === circuit && ev.number >= number) number = ev.number + 1; });
  var id = 'C' + circuit + '-' + (number < 10 ? '0' : '') + number;

  // Match how existing dates are stored, so the public tab's QUERY keeps them.
  var sheet = ss.getSheetByName('Evenings');
  var storedAsText = evenings.some(function (ev) { return ev.dateIsText; });
  var r = sheet.getLastRow() + 1;
  sheet.getRange(r, 4).setNumberFormat(storedAsText ? '@' : 'yyyy-mm-dd');
  sheet.getRange(r, 6).setNumberFormat('@'); // a name like "1947" must stay text
  sheet.getRange(r, 1, 1, 6).setValues([[id, circuit, number, iso, chooser, name]]);
  sheet.getRange(r, 7).setFormula('=IFERROR(AVERAGEIFS(Log!D:D,Log!A:A,A' + r + ',Log!C:C,"Scored"),"")').setNumberFormat('0.00');

  var there = {};
  there[chooser] = true;
  [].concat(a.present || []).forEach(function (display) {
    var s = sfSheetName_(display);
    if (s) there[s] = true;
  });
  var rows = SF_WIZARDS.map(function (w) {
    return [id, w[1], there[w[1]] ? 'TBC' : 'DNA', '', SF_SOURCE, now, ''];
  });
  var log = ss.getSheetByName('Log');
  log.getRange(log.getLastRow() + 1, 1, rows.length, 7).setValues(rows);

  return { changed: true, message: 'Recorded ' + id + ' ' + name + ' (' + Object.keys(there).length + ' there)' };
}

// ---------------------------------------------------------------- helpers

function sfSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID') || SF_SHEET_ID;
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('Cannot find the Sheet. Paste its ID into SF_SHEET_ID at the top of this file.');
}

/** Stop before creating anything if the Sheet is not laid out as expected. */
function sfCheckSheet_(ss) {
  [['Evenings', SF_EVENINGS_HEADER], ['Log', SF_LOG_HEADER]].forEach(function (pair) {
    var sheet = ss.getSheetByName(pair[0]);
    if (!sheet) throw new Error('The Sheet has no "' + pair[0] + '" tab.');
    var header = sheet.getRange(1, 1, 1, pair[1].length).getValues()[0];
    pair[1].forEach(function (want, i) {
      if (String(header[i]).trim() !== want) {
        throw new Error(pair[0] + ' column ' + (i + 1) + ' should be "' + want + '" but is "' + header[i] + '".');
      }
    });
  });
}

/** Rows of the Evenings tab as objects, dates normalised to YYYY-MM-DD. */
function sfEvenings_(ss) {
  var values = ss.getSheetByName('Evenings').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var v = values[i];
    var id = String(v[0]).trim();
    if (!/^C\d+-\d{2}$/.test(id)) continue;
    var isDate = Object.prototype.toString.call(v[3]) === '[object Date]';
    out.push({
      id: id,
      circuit: Number(v[1]),
      number: Number(v[2]),
      date: isDate ? Utilities.formatDate(v[3], ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : String(v[3]).trim(),
      dateIsText: !isDate && String(v[3]).trim() !== '',
      chooser: String(v[4]).trim(),
      restaurant: String(v[5]).trim()
    });
  }
  return out;
}

/** "C8-02 · Barrafina · 3 Dec 2026 · Dan's pick", newest first. */
function sfEveningLabels_(evenings) {
  return evenings.slice()
    .sort(function (x, y) { return y.circuit - x.circuit || y.number - x.number; })
    .slice(0, SF_RECENT)
    .map(function (ev) {
      var parts = [ev.id, ev.restaurant];
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ev.date);
      if (m) parts.push(Number(m[3]) + ' ' + SF_MONTHS[Number(m[2]) - 1] + ' ' + m[1]);
      var display = sfDisplayName_(ev.chooser);
      if (display) parts.push(display + "'s pick");
      return parts.join(' · ');
    });
}

/** Current circuit first, then the next one, then the previous for a late evening. */
function sfCircuitChoices_(evenings) {
  var current = 1;
  evenings.forEach(function (ev) { if (ev.circuit > current) current = ev.circuit; });
  var out = [
    sfOrdinal_(current) + ' circuit (the current one)',
    sfOrdinal_(current + 1) + ' circuit (this evening starts it)'
  ];
  if (current > 1) out.push(sfOrdinal_(current - 1) + ' circuit (a late one)');
  return out;
}

function sfOrdinal_(n) {
  var tens = n % 100;
  if (tens >= 11 && tens <= 13) return n + 'th';
  return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
}

function sfSheetName_(display) {
  var hit = SF_WIZARDS.filter(function (w) { return w[0] === display || w[1] === display; })[0];
  return hit ? hit[1] : '';
}

function sfDisplayName_(sheetName) {
  var hit = SF_WIZARDS.filter(function (w) { return w[1] === sheetName; })[0];
  return hit ? hit[0] : '';
}

/**
 * A restaurant name the website will accept: no links or "@" (its privacy
 * check fails the whole build on those), at most 80 characters.
 */
function sfCleanName_(text) {
  var s = String(text || '')
    .replace(/https?:\/\/\S*/gi, ' ')
    .replace(/docs\.google\.com\S*/gi, ' ')
    .replace(/http/gi, ' ')
    .replace(/@/g, ' at ')
    .replace(/\s+/g, ' ')
    .trim();
  return sfText_(s.slice(0, 80).trim());
}

/** Free text that can never be read by Sheets as a formula. */
function sfText_(text) {
  var s = String(text === undefined || text === null ? '' : text).trim();
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// ---------------------------------------------------------------- website refresh

/**
 * Ask for one website rebuild a few minutes from now. The published CSV tabs
 * lag the Sheet, so rebuilding straight away would pick up the old data.
 */
function sfQueuePing_() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('GITHUB_TOKEN')) return;
  var pending = Number(props.getProperty('SF_PING_PENDING') || 0);
  if (pending && Date.now() - pending < 20 * 60 * 1000) return; // one is already on its way
  props.setProperty('SF_PING_PENDING', String(Date.now()));
  ScriptApp.newTrigger('sfPingSite').timeBased().after(SF_PING_DELAY_MIN * 60 * 1000).create();
}

function sfPingSite() {
  var props = PropertiesService.getScriptProperties();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sfPingSite') ScriptApp.deleteTrigger(t);
  });
  props.deleteProperty('SF_PING_PENDING');
  var token = props.getProperty('GITHUB_TOKEN');
  if (!token) return;
  var res = UrlFetchApp.fetch('https://api.github.com/repos/' + SF_REPO + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ event_type: 'sheet-updated' }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 204) {
    Logger.log('Website rebuild request failed: HTTP ' + res.getResponseCode() + ' ' + res.getContentText());
  }
}
