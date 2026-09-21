# Guild boss reporter

These two files replace the supplied gboss userscript and Google Apps Script.
They are separate from the React client in the parent directory.

## Install

1. In your destination spreadsheet, open **Extensions > Apps Script**. Replace the old server code with `Code.gs`.
2. Run **initialSetup** once and authorize spreadsheet access. It saves the spreadsheet ID and creates an empty `Data` sheet if needed. Existing row 1 must contain exactly one each of `Remaining`, `Minutes`, and `Seconds` (case-sensitive, any order).
3. Choose **Deploy > Manage deployments**, edit the web-app deployment, select **New version**, and deploy. Use **Execute as: Me**, with access **Anyone** so Tampermonkey can submit without a Google sign-in page. If your account prevents anonymous web apps, this setup needs a different authenticated transport. This access setting allows anyone who has the endpoint URL to submit values.
4. Copy the web app's **/exec** URL into `URL` in `gboss.user.js` if it differs from the existing URL. Saving Apps Script source alone does not update a versioned deployment. **FIRST TIME SETUP REPLACE THE TEXT "REPLACE ME"**
5. Replace the entire old **gboss** Tampermonkey script, including its metadata, with `gboss.user.js`. Save, enable it, accept its connection permissions if prompted, and reload the game. Disable any duplicate old gboss script.
6. Open/fight the guild Dragon normally. In the browser developer console, look for `[gboss] Updated Google Sheets:` and confirm row 2 changes in `Data`. Failures appear with `[gboss]` and an error message.

Version 2.4.0 runs without a panel, buttons, or diagnostic menu commands. Startup, successful uploads, and errors are logged to the browser console with the `[gboss]` prefix. Successful uploads include request duration in milliseconds. It starts at `document-start` with `@sandbox DOM` and does not wait for page readiness events.

The reporter checks `#content` every 250 milliseconds and sends only changed status, with one request in flight. There is no delay after a successful upload. If the display changes during an upload, the latest displayed status is sent immediately when that request completes. This removes the old extra four-second wait after Google's response, which could skip a 4.5-second game update. Polling itself makes no network requests. Failed requests wait 15 seconds before retrying the currently displayed status. Successful identical values are not resent. It observes the game's displayed time; it does not run a separate countdown or automate combat.

Google response latency still limits throughput. If a request takes longer than several game updates, intermediate values can be skipped in favor of the latest visible status; this sheet is a current-state record, not a history queue. Browser background timer throttling can also delay detection. Check the logged request duration if updates remain slow. This version only requires replacing the userscript; no Apps Script redeployment is needed.

The supplied HTML produces `Remaining = "152,346,348,513"`, `Minutes = "14"`, and `Seconds = "40"`. All three values are stored as plain text. Singular units and time with only minutes or only seconds are supported. HP stays text end to end, including values larger than JavaScript's safe integer range.

Row 2 remains the latest observed status, matching the old script's overwrite behavior. Missing status, leaving the boss screen, or boss death does not clear it or imply zero HP. No timestamp is recorded. Other columns are preserved. Separate tabs/players can overwrite row 2; this is a single shared latest-status record.

## Review findings

- The supplied HTML still contains the exact status sentence expected by the old parser. Without the actual console error, the original failure cannot be pinned to one cause.
- Overriding `gboss` duplicates the game's request, rendering, evaluation, and combat scheduling logic. Changes to page globals or dependencies can break that copy. The replacement only reads rendered text.
- The original plain `fetch` never checked HTTP status or the JSON result, and did not catch asynchronous request failures. The replacement uses Tampermonkey's cross-origin request API and checks the response.
- The original `tryLock` result was ignored. The server now writes only after acquiring the lock and releases it only when held.
- Serializing an Error object often produces `{}`. The server now returns the error message and validates setup, headers, and inputs.

Documentation: [Tampermonkey requests and permissions](https://www.tampermonkey.net/documentation.php#api:GM_xmlhttpRequest), [Apps Script web apps and deployments](https://developers.google.com/apps-script/guides/web), [Apps Script locks](https://developers.google.com/apps-script/reference/lock).
