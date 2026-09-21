## Install

1. In your destination spreadsheet, open **Extensions > Apps Script**. Replace any code in Code.gs with the [gscript.js](https://github.com/DieRandomDie/lyraniaGbossGsheet/blob/main/gscript.js).
<img width="759" height="484" alt="image" src="https://github.com/user-attachments/assets/2d064d60-f9f5-4120-b3aa-846afab81d40" />

2. Run **initialSetup** once and authorize spreadsheet access. It saves the spreadsheet ID and creates an empty `Data` sheet if needed. Existing row 1 must contain exactly one each of `Remaining`, `Minutes`, and `Seconds` (case-sensitive, any order).
<img width="1175" height="432" alt="image" src="https://github.com/user-attachments/assets/7449e03f-98e3-4747-abdf-401de1f48a38" />

3. Choose **Deploy > Manage deployments**, edit the web-app deployment, select **New version**, and deploy. Use **Execute as: Me**, with access **Anyone** so Tampermonkey can submit without a Google sign-in page. If your account prevents anonymous web apps, this setup needs a different authenticated transport. This access setting allows anyone who has the endpoint URL to submit values.
<img width="323" height="265" alt="image" src="https://github.com/user-attachments/assets/88ab822e-c13b-40ce-9a60-7aa13c5cb8ff" />
<img width="784" height="633" alt="image" src="https://github.com/user-attachments/assets/62ac35d5-b01c-4e41-87fb-8c316b6a354b" />
<img width="783" height="645" alt="image" src="https://github.com/user-attachments/assets/eb49af94-6238-4ebe-9a97-2a63ed97d40b" />

4. Copy the web app's **/exec** URL.
<img width="556" height="144" alt="image" src="https://github.com/user-attachments/assets/09b7f7a4-e3f3-4417-bc94-24b1629ea42e" />

5. **First time setup only:** replace "REPLACE ME" on line 21 in the tampermonkey script with the **/exec** URL. Replace the entire old **gboss** Tampermonkey script, including its metadata, with [`tampermonkey.js`](https://github.com/DieRandomDie/lyraniaGbossGsheet/blob/main/tampermonkey.js). Save, enable it, accept its connection permissions if prompted, and reload the game. 

6. Open/fight the guild Dragon normally. In the browser developer console, look for `[gboss] Updated Google Sheets:` and confirm row 2 changes in `Data`. Failures appear with `[gboss]` and an error message.
