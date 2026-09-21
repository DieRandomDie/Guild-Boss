// ==UserScript==
// @name         gboss
// @namespace    http://tampermonkey.net/
// @version      2.4.0
// @description  Report displayed guild Dragon health and time to Google Sheets.
// @author       dierandomdie
// @match        https://lyrania.co.uk/game.php*
// @match        https://dev.lyrania.co.uk/game.php*
// @icon         https://lyrania.co.uk/favicon.ico
// @run-at       document-start
// @sandbox      DOM
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==

(() => {
  'use strict';

  console.info('[gboss] Reporter 2.4.0 started');
  const URL = 'REPLACE ME'; // LOOKS LIKE THIS: https://script.google.com/macros/s/LONGSTRINGOFTEXT/exec
  let lastSent = '';
  let busy = false;
  let nextAttemptAt = 0;
  function parseStatus(text) {
    const match = text.replace(/\s+/g, ' ').match(
      /The Dragon has ([\d,]+) health points? remaining and will continue to be vulnerable for another (?:(\d+) minutes?\b(?:\s+and\s+|\s*)?)?(?:(\d+) seconds?\b)?/i
    );
    if (!match || (match[2] === undefined && match[3] === undefined)) return null;
    return {
      Remaining: match[1], // Never convert HP to Number: it may exceed safe integer precision.
      Minutes: match[2] || '0',
      Seconds: match[3] || '0',
    };
  }

  function postStatus(status) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('Tampermonkey request permission is missing. Replace the ENTIRE script, including its // ==UserScript== header, save, and reload.'));
        return;
      }
      GM_xmlhttpRequest({
        method: 'POST',
        url: URL,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        data: new URLSearchParams(status).toString(),
        timeout: 30000,
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`Google returned HTTP ${response.status}. Check web-app deployment and access.`));
            return;
          }
          try {
            if (/^\s*</.test(response.responseText)) {
              throw new Error('Google returned an HTML page instead of JSON; verify the deployment URL, access, and deployed version');
            }
            const result = JSON.parse(response.responseText);
            if (result.result !== 'success') throw new Error(result.error || 'Google rejected the update.');
            resolve(result);
          } catch (error) {
            reject(new Error(`Invalid or unsuccessful Google response: ${error.message}. Check the /exec URL and web-app access.`));
          }
        },
        onerror: () => reject(new Error('Network request failed. Check Tampermonkey domain permissions and connectivity.')),
        ontimeout: () => reject(new Error('Google request timed out.')),
        onabort: () => reject(new Error('Google request was aborted.')),
      });
    });
  }

  async function checkStatus() {
    if (busy || Date.now() < nextAttemptAt) return;
    const content = document.getElementById('content');
    const status = content && parseStatus(content.textContent || '');
    // Missing status does not prove the boss died; retain the last confirmed row.
    if (!status) return;
    const key = JSON.stringify(status);
    if (key === lastSent) return;
    busy = true;
    const startedAt = Date.now();
    try {
      await postStatus(status);
      lastSent = key;
      nextAttemptAt = 0;
      console.info('[gboss] Updated Google Sheets:', status, `Request took ${Date.now() - startedAt}ms`);
    } catch (error) {
      nextAttemptAt = Date.now() + 15000;
      console.error('[gboss]', error.message);
    } finally {
      busy = false;
      // If the display changed during the upload, send its latest values now.
      // Failure backoff and duplicate suppression still apply.
      void checkStatus();
    }
  }

  // Re-read #content each time because the game may replace the entire element.
  // This never calls gboss, changes combat timing, or evaluates server code.
  setInterval(checkStatus, 250);
  checkStatus();
})();
