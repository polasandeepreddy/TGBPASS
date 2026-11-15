import os
import tempfile
import unittest
from unittest import mock

_tmp = tempfile.mkdtemp()
os.environ['DONATIONS_DB_PATH'] = os.path.join(_tmp, 'donations_test.db')

import donations  # noqa: E402
from app import app  # noqa: E402

TOKEN = 'a' * 20


def payload(**kw):
    d = {'amount': 100, 'client_token': 'tok_' + os.urandom(8).hex()}
    d.update(kw)
    return d


class DonationTests(unittest.TestCase):
    def setUp(self):
        self.c = app.test_client()
        donations._hits.clear()
        self.admin = {'Authorization': f'Bearer {TOKEN}'}
        p = mock.patch('app.auth_manager.validate_session', side_effect=lambda t: t == TOKEN)
        p.start()
        self.addCleanup(p.stop)

    def create(self, **kw):
        r = self.c.post('/api/donations', json=payload(**kw))
        return r, r.get_json()

    def test_create_anonymous(self):
        r, j = self.create()
        self.assertEqual(r.status_code, 201)
        self.assertEqual(j['data']['status'], 'pending')
        self.assertRegex(j['data']['ref'], r'^DON-[A-Z0-9]{10}$')

    def test_validation(self):
        for bad in [dict(amount=0), dict(amount=-5), dict(amount='abc'), dict(amount=10.5),
                    dict(amount=10**7), dict(amount=True), dict(email='nope'), dict(phone='123'),
                    dict(name='x' * 101), dict(client_token='short')]:
            r, _ = self.create(**bad)
            self.assertEqual(r.status_code, 400, bad)
        self.assertEqual(self.create(amount=1)[0].status_code, 201)

    def test_optional_details_normalised(self):
        _, j = self.create(name=' Asha ', email='a@b.co', phone='+91 98765-43210')
        row = donations.get_donation(j['data']['ref'])
        self.assertEqual((row['name'], row['phone']), ('Asha', '9876543210'))

    def test_duplicate_token_returns_same_record(self):
        p = payload()
        a = self.c.post('/api/donations', json=p).get_json()['data']
        r = self.c.post('/api/donations', json=dict(p, amount=250))
        b = r.get_json()['data']
        self.assertEqual(r.status_code, 200)
        self.assertEqual(a['ref'], b['ref'])
        self.assertEqual(b['amount'], 250)  # still pending -> editable
        rows, _ = donations.list_donations()
        self.assertEqual(len([x for x in rows if x['ref'] == a['ref']]), 1)

    def test_confirm_is_self_reported_never_verified(self):
        _, j = self.create()
        ref = j['data']['ref']
        r = self.c.post(f'/api/donations/{ref}/confirm', json={'utr': '123456789012'})
        self.assertEqual(r.get_json()['data']['status'], 'self_reported')
        self.assertEqual(self.c.get(f'/api/donations/{ref}').get_json()['data']['status'], 'self_reported')

    def test_confirm_bad_utr_and_unknown_ref(self):
        _, j = self.create()
        self.assertEqual(self.c.post(f"/api/donations/{j['data']['ref']}/confirm", json={'utr': '!!'}).status_code, 400)
        self.assertEqual(self.c.post('/api/donations/DON-AAAAAAAAAA/confirm', json={}).status_code, 404)
        self.assertEqual(self.c.get('/api/donations/garbage').status_code, 404)

    def test_public_status_hides_personal_data(self):
        _, j = self.create(name='Secret', email='s@x.com', phone='9876543210')
        data = self.c.get(f"/api/donations/{j['data']['ref']}").get_json()['data']
        self.assertEqual(set(data), {'ref', 'amount', 'status'})

    def test_verify_requires_admin(self):
        _, j = self.create()
        ref = j['data']['ref']
        self.assertEqual(self.c.post(f'/api/admin/donations/{ref}/verify').status_code, 401)
        self.assertEqual(self.c.get('/api/admin/donations').status_code, 401)
        self.assertEqual(self.c.get('/api/admin/donations/export').status_code, 401)
        r = self.c.post(f'/api/admin/donations/{ref}/verify', headers=self.admin)
        self.assertEqual(r.get_json()['data']['status'], 'verified')

    def test_verified_not_downgraded_by_confirm(self):
        _, j = self.create()
        ref = j['data']['ref']
        self.c.post(f'/api/admin/donations/{ref}/verify', headers=self.admin)
        r = self.c.post(f'/api/donations/{ref}/confirm', json={'utr': 'ABCDEFGH1234'})
        self.assertEqual(r.get_json()['data']['status'], 'verified')

    def test_admin_list_and_filter(self):
        _, j = self.create(name='Lister')
        self.c.post(f"/api/donations/{j['data']['ref']}/confirm", json={})
        d = self.c.get('/api/admin/donations?status=self_reported', headers=self.admin).get_json()['data']
        self.assertTrue(all(x['status'] == 'self_reported' for x in d['donations']))
        self.assertGreaterEqual(d['summary']['self_reported']['count'], 1)
        self.assertTrue(any(x['name'] == 'Lister' for x in d['donations']))

    def test_csv_export_and_formula_injection(self):
        self.create(name='=HYPERLINK("x")')
        r = self.c.get('/api/admin/donations/export', headers=self.admin)
        self.assertEqual(r.status_code, 200)
        self.assertIn('text/csv', r.content_type)
        text = r.get_data(as_text=True)
        self.assertIn('Reference', text)
        self.assertIn("'=HYPERLINK", text)

    def test_rate_limit(self):
        codes = [self.c.post('/api/donations', json=payload()).status_code for _ in range(donations.RATE_LIMIT + 1)]
        self.assertEqual(codes[-1], 429)

    def test_unrelated_route_still_works(self):
        self.assertNotEqual(self.c.get('/api/stats').status_code, 404)


if __name__ == '__main__':
    unittest.main()
