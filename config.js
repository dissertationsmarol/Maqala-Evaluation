// The only file you edit on the website side. See SETUP.md, steps 6 and 8.
window.MAQALA_CONFIG = {
  // The "Web app" URL from Apps Script > Deploy (ends with /exec).
  API_URL: 'PASTE_THE_WEB_APP_URL_HERE',

  // The OAuth Client ID from Google Cloud (ends with .apps.googleusercontent.com).
  // The same value goes in the settings tab of the spreadsheet (google_client_id).
  GOOGLE_CLIENT_ID: 'PASTE_THE_CLIENT_ID_HERE',

  // Only used to hint the Google account picker. The real check is the teachers tab.
  HOSTED_DOMAIN: 'jameasaifiyah.edu',

  // pdf.js is loaded from this folder. Leave as is unless you host your own copy.
  PDFJS_BASE: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/'
};
