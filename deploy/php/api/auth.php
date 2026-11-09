<?php
// Google sign-in with the server-side authorization-code flow (no Google script on our pages).
declare(strict_types=1);
require __DIR__ . '/lib.php';

$cfg = eb_config();
$g = $cfg['google'] ?? [];
$base = rtrim($cfg['base_url'] ?? '', '/');
$redirectUri = "$base/api/auth.php";
$safeReturn = function (?string $r): string { return ($r && preg_match('#^/[A-Za-z0-9/_\-.?=&%]*$#', $r) && !str_starts_with($r, '//')) ? $r : '/'; };

eb_session();
$action = $_GET['action'] ?? '';

if ($action === 'logout') {
  eb_require_post();
  $_SESSION = [];
  session_destroy();
  eb_json(['ok' => true]);
}

if ($action === 'start') {
  if (empty($g['client_id'])) eb_json(['error' => 'Google sign-in is not configured on this server yet.'], 503);
  $_SESSION['oauth_state'] = bin2hex(random_bytes(16));
  $_SESSION['oauth_return'] = $safeReturn($_GET['return'] ?? '/');
  header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
    'client_id' => $g['client_id'], 'redirect_uri' => $redirectUri, 'response_type' => 'code',
    'scope' => 'openid email profile', 'state' => $_SESSION['oauth_state'], 'prompt' => 'select_account',
  ]));
  exit;
}

if (isset($_GET['code'], $_GET['state'])) {
  $back = $safeReturn($_SESSION['oauth_return'] ?? '/');
  $fail = function (string $why) use ($base, $back) { header('Location: ' . $base . $back . (str_contains($back, '?') ? '&' : '?') . 'login_error=' . rawurlencode($why)); exit; };
  if (!hash_equals($_SESSION['oauth_state'] ?? '', (string) $_GET['state'])) $fail('state');
  unset($_SESSION['oauth_state']);

  $ch = curl_init('https://oauth2.googleapis.com/token');
  curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_POSTFIELDS => http_build_query([
    'code' => $_GET['code'], 'client_id' => $g['client_id'], 'client_secret' => $g['client_secret'],
    'redirect_uri' => $redirectUri, 'grant_type' => 'authorization_code',
  ])]);
  $tok = json_decode((string) curl_exec($ch), true);
  curl_close($ch);
  if (empty($tok['id_token'])) $fail('token');

  // Received straight from Google's token endpoint over TLS, so the payload can be trusted after these checks.
  $parts = explode('.', $tok['id_token']);
  $claims = json_decode((string) base64_decode(strtr($parts[1] ?? '', '-_', '+/')), true) ?: [];
  $okIss = in_array($claims['iss'] ?? '', ['https://accounts.google.com', 'accounts.google.com'], true);
  if (!$okIss || ($claims['aud'] ?? '') !== $g['client_id'] || ($claims['exp'] ?? 0) < time() || empty($claims['sub']) || empty($claims['email_verified'])) $fail('claims');

  $db = eb_db();
  $db->prepare('INSERT INTO users (google_sub, email, name, picture, last_login) VALUES (?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name), picture = VALUES(picture), last_login = NOW()')
    ->execute([$claims['sub'], $claims['email'], $claims['name'] ?? '', $claims['picture'] ?? '']);
  $q = $db->prepare('SELECT id FROM users WHERE google_sub = ?');
  $q->execute([$claims['sub']]);
  session_regenerate_id(true);
  $_SESSION['uid'] = (int) $q->fetchColumn();
  header('Location: ' . $base . $back);
  exit;
}

eb_json(['error' => 'Unknown action'], 400);
