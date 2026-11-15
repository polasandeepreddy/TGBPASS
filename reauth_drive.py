"""Renews the Google Drive login (token.json). Run once when you see 'invalid_grant'."""
from google_auth_oauthlib.flow import InstalledAppFlow
from drive_manager import SCOPES

flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
creds = flow.run_local_server(port=0, prompt='consent', open_browser=True)
with open('token.json', 'w', encoding='utf-8') as f:
    f.write(creds.to_json())
print('token.json renewed')
