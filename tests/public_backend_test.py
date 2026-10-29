import base64
import gzip
from pathlib import Path
import tempfile
import unittest
from urllib.parse import quote_from_bytes

from lupa import LuaRuntime


class PublicBackendTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(dir=Path.cwd())
        self.root = Path(self.folder.name)
        self.lua = LuaRuntime(encoding=None, unpack_returned_tuples=True)
        self.calls = []
        self.body = b'<html>public page</html>'
        self.status = 200
        self.png = b'\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0binary-end'
        globals = self.lua.globals()
        globals[b'py_root'] = str(self.root).encode()
        globals[b'py_request'] = self.request
        globals[b'py_download'] = self.download
        globals[b'py_read'] = lambda path: Path(path.decode()).read_bytes() if Path(path.decode()).exists() else None
        globals[b'py_write'] = self.write
        globals[b'py_mkdir'] = self.mkdir
        globals[b'py_remove'] = self.remove
        globals[b'py_base64'] = lambda data: base64.b64encode(data)
        globals[b'py_quote'] = lambda data: quote_from_bytes(data).encode()
        self.lua.execute(b'''
          package.preload.http=function()return {
            request=function(...)return py_request(...)end,
            download=function(...)return py_download(...)end
          }end
          package.preload.utils=function()return {
            read_file=function(...)return py_read(...)end,
            write_file=function(...)return py_write(...)end,
            base64_encode=function(...)return py_base64(...)end,
            url_encode=function(...)return py_quote(...)end
          }end
          package.preload.fs=function()return {
            create_directories=function(...)return py_mkdir(...)end,
            remove=function(...)return py_remove(...)end
          }end
          package.preload.millennium=function()return {steam_path=function()return py_root end}end
        ''')
        self.catalog = self.lua.execute((Path(__file__).resolve().parents[1] / 'backend/public_catalog.lua').read_bytes())

    def tearDown(self):
        self.assertEqual(self.root.resolve().parent, Path.cwd().resolve())
        self.folder.cleanup()

    def request(self, url, options):
        self.calls.append((url, options))
        return self.lua.table_from({b'status': self.status, b'body': self.body})

    def download(self, url, path, options):
        self.calls.append((url, options))
        Path(path.decode()).write_bytes(self.png)
        return self.lua.table_from({b'success': True, b'status': 200, b'bytes_written': len(self.png)})

    def write(self, path, data):
        Path(path.decode()).write_bytes(data)
        return True

    def mkdir(self, path):
        Path(path.decode()).mkdir(parents=True, exist_ok=True)
        return True

    def remove(self, path):
        Path(path.decode()).unlink(missing_ok=True)
        return True

    def test_requests_use_fixed_hosts_timeouts_and_encoded_search(self):
        self.catalog[b'steam_page'](1245620)
        self.assertEqual(self.calls[-1][0], b'https://steamcommunity.com/achievements/1245620?l=english')
        self.catalog[b'search'](b'Elden Ring & Test')
        self.assertEqual(self.calls[-1][1][b'data'], b'search_char=Elden%20Ring%20%26%20Test')
        self.catalog[b'page'](b'elden-ring-ps5', b'1')
        url, options = self.calls[-1]
        self.assertEqual(url, b'https://psntrophyleaders.com/game/view/elden-ring-ps5/1')
        self.assertEqual(options[b'timeout'], 15)
        self.assertFalse(options[b'follow_redirects'])
        self.assertTrue(options[b'verify_ssl'])

    def test_global_steam_percentages_use_the_fixed_public_api_without_a_key(self):
        self.catalog[b'steam_percentages'](362680)
        url, options = self.calls[-1]
        self.assertEqual(url, b'https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=362680')
        self.assertEqual(options[b'timeout'], 15)
        self.assertTrue(options[b'verify_ssl'])
        for appid in (b'../private', 1.5, 0, 2147483648):
            with self.assertRaises(Exception):
                self.catalog[b'steam_percentages'](appid)
        self.assertEqual(len(self.calls), 1)

    def test_invalid_paths_and_remote_hosts_are_rejected_before_network(self):
        for function, args in [
            ('steam_page', (b'../private',)), ('steam_page', (1.5,)),
            ('page', (b'../private', b'')), ('page', (b'valid-ps5', b'../secret')),
            ('icon', (b'https://example.com/icon.png',)),
        ]:
            with self.assertRaises(Exception):
                self.catalog[function.encode()](*args)
        self.assertFalse(self.calls)

    def test_xbox_requests_use_fixed_public_endpoints_and_validate_title_ids(self):
        self.catalog[b'xbox_search'](b'Hades & Test')
        self.assertEqual(self.calls[-1][0], b'https://xct.live/api/v1/store/products?q=Hades%20%26%20Test&per_page=25&lite=1')
        self.catalog[b'xbox_achievements'](b'1859409710')
        self.assertEqual(self.calls[-1][0], b'https://xct.live/api/v1/store/title-achievements/1859409710')
        for title in (b'../private', b'https://example.com', b'', b'12345678901'):
            with self.assertRaises(Exception):
                self.catalog[b'xbox_achievements'](title)
        self.assertEqual(len(self.calls), 2)

    def test_xbox_and_playstation_caches_are_separate(self):
        self.catalog[b'write_cache'](123, b'PS')
        self.catalog[b'write_cache'](123, b'Xbox', b'xbox_')
        self.assertEqual(self.catalog[b'read_cache'](123), b'PS')
        self.assertEqual(self.catalog[b'read_cache'](123, b'xbox_'), b'Xbox')

    def test_png_download_retains_null_bytes_and_reuses_the_image_cache(self):
        url = b'https://np.sentl.com/images/games/test/l/original.png'
        expected = b'data:image/png;base64,' + base64.b64encode(self.png)
        self.assertEqual(self.catalog[b'icon'](url), expected)
        self.assertEqual(self.catalog[b'icon'](url), expected)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(len(list(self.root.rglob('icon_test_l_original.png'))), 1)

    def test_cache_persists_only_under_the_plugin_cache_directory(self):
        self.assertEqual(self.catalog[b'read_cache'](1245620), b'')
        self.assertTrue(self.catalog[b'write_cache'](1245620, b'{"version":2}'))
        self.assertEqual(self.catalog[b'read_cache'](1245620), b'{"version":2}')
        expected = self.root / 'millennium/cache/trophy-styles/1245620.json'
        self.assertEqual(expected.read_bytes(), b'{"version":2}')

    def test_http_errors_and_oversized_pages_are_not_returned_as_catalogs(self):
        self.status = 503
        with self.assertRaises(Exception):
            self.catalog[b'steam_page'](1245620)
        self.status = 200
        self.body = b'x' * 6000001
        with self.assertRaises(Exception):
            self.catalog[b'steam_page'](1245620)

    def test_bundled_resource_getters_return_lossless_gzip_and_reject_unknown_names(self):
        project = Path(__file__).resolve().parents[1]
        globals = self.lua.globals()
        globals[b'py_asset_read'] = lambda path: (project / path.decode()).read_bytes()
        self.lua.execute(b'''
          require('millennium').assets={read=function(path)return py_asset_read(path)end}
          package.preload.public_catalog=function()return {}end
        ''')
        self.lua.execute((project / 'backend/main.lua').read_bytes())
        sounds = [
            (b'getTrophySoundUri', (), 'ps5-trophy.wav'),
            (b'getPlatinumSoundUri', (), 'ps5-platinum.wav'),
            (b'getPs4TrophySoundUri', (), 'ps4-trophy.wav'),
            *[(b'getXboxSoundUri', (variant.encode(),), f'xbox/{variant}.wav') for variant in ['normal', 'rare', 'mythic']],
        ]
        for function, args, filename in sounds:
            with self.subTest(resource=filename):
                uri = globals[function](*args)
                self.assertTrue(uri.startswith(b'data:application/gzip;base64,'))
                restored = gzip.decompress(base64.b64decode(uri.split(b',', 1)[1]))
                self.assertEqual(restored, (project / 'resources' / filename).read_bytes())
        self.assertIsNone(globals[b'getPs5Trophies'])
        with self.assertRaises(Exception):
            globals[b'getXboxSoundUri'](b'unknown')

    def test_completion_claim_is_idempotent_and_scoped_to_account_and_game(self):
        config = {}
        globals = self.lua.globals()
        globals[b'py_config_get'] = lambda key: config.get(key)
        globals[b'py_config_set'] = lambda key, value: config.__setitem__(key, value) is None
        globals[b'py_config_delete'] = lambda key: config.pop(key, None) is not None
        self.lua.execute(b'''
          require('millennium').config={
            get=function(key)return py_config_get(key)end,
            set=function(key,value)return py_config_set(key,value)end,
            delete=function(key)return py_config_delete(key)end
          }
          package.preload.public_catalog=function()return {}end
        ''')
        self.lua.execute((Path(__file__).resolve().parents[1] / 'backend/main.lua').read_bytes())
        user = b'76561198000000001'
        self.assertFalse(globals[b'hasCompletionPlatinum'](user, 990080))
        self.assertTrue(globals[b'claimCompletionPlatinum'](user, 990080))
        self.assertFalse(globals[b'claimCompletionPlatinum'](user, 990080))
        self.assertTrue(globals[b'claimCompletionPlatinum'](b'76561198000000002', 990080))
        self.assertTrue(globals[b'claimCompletionPlatinum'](user, 12345))
        self.assertEqual(len(config), 3)
        self.assertTrue(globals[b'releaseCompletionPlatinum'](user, 990080))
        self.assertTrue(globals[b'claimCompletionPlatinum'](user, 990080))
        with self.assertRaises(Exception):
            globals[b'claimCompletionPlatinum'](b'invalid-user', 990080)
        self.assertFalse(globals[b'hasCompletionMythic'](user, 990080))
        self.assertTrue(globals[b'claimCompletionMythic'](user, 990080))
        self.assertFalse(globals[b'claimCompletionMythic'](user, 990080))
        self.assertTrue(globals[b'hasCompletionPlatinum'](user, 990080))
        self.assertTrue(globals[b'releaseCompletionMythic'](user, 990080))
        self.assertFalse(globals[b'hasCompletionMythic'](user, 990080))


if __name__ == '__main__':
    unittest.main()
