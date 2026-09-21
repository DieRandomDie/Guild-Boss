const SHEET_NAME = 'Data';
const REQUIRED_HEADERS = ['Remaining', 'Minutes', 'Seconds'];

// Run once from Extensions > Apps Script in the destination spreadsheet.
function initialSetup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Run setup from an Apps Script project bound to the destination spreadsheet.');
  PropertiesService.getScriptProperties().setProperty('key', spreadsheet.getId());
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, REQUIRED_HEADERS.length).setValues([REQUIRED_HEADERS]);
  }
  getHeaders_(sheet);
}

// Keep compatibility with the original misspelled setup function.
function intialSetup() {
  initialSetup();
}

function getHeaders_(sheet) {
  const width = sheet.getLastColumn();
  if (!width) throw new Error('The Data sheet needs headers: ' + REQUIRED_HEADERS.join(', '));
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0].map(String);
  REQUIRED_HEADERS.forEach(function(header) {
    if (headers.filter(function(value) { return value === header; }).length !== 1) {
      throw new Error('Row 1 must contain exactly one header named ' + header);
    }
  });
  return headers;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let acquired = false;
  try {
    const params = e && e.parameter;
    if (!params) throw new Error('No POST parameters. Send a request from the userscript; do not run doPost manually.');
    const hp = String(params.Remaining || '').trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(hp)) throw new Error('Remaining must be a non-negative integer, optionally comma-separated.');
    const minutes = parseTime_(params.Minutes, 'Minutes');
    const seconds = parseTime_(params.Seconds, 'Seconds');
    if (seconds > 59) throw new Error('Seconds must be between 0 and 59.');

    acquired = lock.tryLock(10000);
    if (!acquired) throw new Error('The sheet is busy. Please retry.');
    const id = PropertiesService.getScriptProperties().getProperty('key');
    if (!id) throw new Error('Run initialSetup once before deploying.');
    const sheet = SpreadsheetApp.openById(id).getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Missing Data sheet. Run initialSetup.');
    const headers = getHeaders_(sheet);
    const values = { Remaining: hp, Minutes: minutes, Seconds: seconds };

    // Store all three reporting fields as text; preserve unrelated columns and formulas.
    REQUIRED_HEADERS.forEach(function(header) {
      const cell = sheet.getRange(2, headers.indexOf(header) + 1);
      cell.setNumberFormat('@');
      cell.setValue(values[header]);
    });
    SpreadsheetApp.flush();
    return json_({ result: 'success', row: 2 });
  } catch (error) {
    return json_({ result: 'error', error: String(error.message || error) });
  } finally {
    if (acquired) lock.releaseLock();
  }
}

function parseTime_(value, name) {
  const text = String(value === undefined ? '' : value).trim();
  const number = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(number)) {
    throw new Error(name + ' must be a non-negative safe integer.');
  }
  return text;
}
