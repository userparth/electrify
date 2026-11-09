<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

$u = eb_require_user();
$b = eb_require_post();

// Only known values are stored, so the column can never carry markup or junk into the page.
const EB_PALETTES = ['paper', 'daylight', 'mint', 'sunny', 'sky'];
const EB_FONTS = ['mono', 'atkinson', 'inter', 'plex', 'figtree'];

$s = is_array($u['settings']) ? $u['settings'] : [];
if (isset($b['palette'])) { if (!in_array($b['palette'], EB_PALETTES, true)) eb_json(['error' => 'Unknown palette.'], 400); $s['palette'] = $b['palette']; }
if (isset($b['font'])) { if (!in_array($b['font'], EB_FONTS, true)) eb_json(['error' => 'Unknown font.'], 400); $s['font'] = $b['font']; }

eb_db()->prepare('UPDATE users SET settings = ? WHERE id = ?')->execute([json_encode($s), $u['id']]);
eb_json(['ok' => true, 'settings' => $s]);
