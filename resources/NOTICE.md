# Asset attribution

The MIT license covers the plugin source code. Third-party artwork, recordings, fonts and brands listed below are excluded from that license and retain their respective rights.

Achievement Styles is an independent Steam plugin. Sony, Microsoft, Monotype and game publishers retain the rights to their respective artwork, recordings, fonts and brands. The plugin does not claim affiliation with those companies.

## PlayStation

PS5 trophy icons and the classic PS4 trophy icons are from PlayStation Wiki. The PS4 source URLs and SHA-256 hashes are recorded in resources/ps4-trophy-sources.json in the source distribution.

- https://static.wikia.nocookie.net/playstation/images/3/3f/Bronze_trophy_(PS5).png/revision/latest
- https://static.wikia.nocookie.net/playstation/images/8/8d/Silver_trophy_(PS5).png/revision/latest
- https://static.wikia.nocookie.net/playstation/images/1/18/Gold_trophy_(PS5).png/revision/latest
- https://static.wikia.nocookie.net/playstation/images/0/0c/Platinum_trophy_(PS5).png/revision/latest
- https://static.wikia.nocookie.net/playstation/images/6/65/Bronze_trophy.png/revision/latest?format=original
- https://static.wikia.nocookie.net/playstation/images/c/c8/Silver_trophy.png/revision/latest?format=original
- https://static.wikia.nocookie.net/playstation/images/f/fd/Gold_trophy.png/revision/latest?format=original
- https://static.wikia.nocookie.net/playstation/images/2/2d/Platinum_trophy.png/revision/latest?format=original

PlayStation logo: https://commons.wikimedia.org/wiki/File:PlayStation_logo.svg. The PS4 badge is a vector reconstruction using this logo.

The PS4 renderer embeds SST Light, owned by Sony and Monotype, from the PlayStation font stack:

- https://static.playstation.com/font-stack/v1/css/font-all.css
- https://static.playstation.com/font-stack/v1/fonts/SST/SST-Light-latin.3cce6.woff2
- https://static.playstation.com/font-stack/v1/fonts/SST/SST-Light-latin-ext.7afe7.woff2
- https://static.playstation.com/font-stack/v1/fonts/SST/SST-Light-cyrillic.8b377.woff2

PS5 trophy and platinum sounds are from Achievement Watcher's Windows media resources. Leading silence was removed; the remaining PCM samples are unchanged.

- https://github.com/xan105/Achievement-Watcher/blob/4129b04b307e0de9fc044699f3902d1bdb6961f9/setup/winmedia/Achievement%20Watcher%20-%20Playstation5.wav
- https://github.com/xan105/Achievement-Watcher/blob/4129b04b307e0de9fc044699f3902d1bdb6961f9/setup/winmedia/Achievement%20Watcher%20-%20Playstation5%20Platinum.wav

PS4 sound: https://github.com/xan105/Achievement-Watcher/blob/d8609019353d66f0cdcebe36c7e548be375df14d/setup/winmedia/Achievement%20Watcher%20-%20Playstation.wav. Leading silence was removed; the remaining PCM samples are unchanged.

The PS5 platinum animation is a processed recording from https://www.youtube.com/watch?v=HM2u2nCh5JA&t=23s. Its 164 WebP frames preserve the extracted motion, play once and hold the final frame. It is not Sony's original model or animation asset.

PS4 layout and motion reference: https://www.youtube.com/watch?v=oHSBZUuv70s&t=33s. Layout and badge motion are reconstructed.

## Xbox

Xbox/Game Bar textures, Mythic flipbooks, storyboards and sounds were retrieved through XCT. Source filenames, URLs, sizes and SHA-256 hashes are recorded in resources/xbox/sources.json in the source distribution.

- https://xct.live/wiki/mythic
- https://xct.live/static/toasts/xbox-toast-assets-2026-09-26.zip
- https://xct.live/static/mythic/

Xbox WAV recordings decode the source MP3 files to stereo PCM16 at 48 kHz without trimming or normalization. Mythic playback splits the recording in memory while preserving the samples.

The standard trophy and rare diamond are reconstructed canvas geometry. Motion references:

- https://www.youtube.com/watch?v=VfvTVP10FIk&t=913s
- https://www.youtube.com/watch?v=JfUrxN4jsl0&t=4421s
- https://www.youtube.com/shorts/8PYWunJ5a2I

The Xbox emblem uses the vector path from Simple Icons 5.0.0 (CC0 collection), with Xbox as its upstream brand source:

- https://raw.githubusercontent.com/simple-icons/simple-icons/5.0.0/icons/xbox.svg
- https://www.xbox.com/en-US/consoles

## Achievement catalogs

Steam provides game achievement names, descriptions, artwork and global percentages. PlayStation lists and artwork are obtained from PSN Trophy Leaders. Xbox rarity and Gamerscore are obtained from XCT. Game publishers retain rights to their achievement artwork and text. Catalog results retain their source pages and artwork URLs.

- https://steamcommunity.com/
- https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/
- https://psntrophyleaders.com/
- https://xct.live/
