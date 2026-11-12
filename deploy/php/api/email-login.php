<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

$b = eb_require_post();
$db = eb_db();
eb_session();
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$email = strtolower(trim((string) ($b['email'] ?? '')));
if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $email)) eb_json(['error' => 'Enter a valid email address.'], 400);

if (($b['action'] ?? '') === 'send') {
  if (!eb_mail_ready()) eb_json(['error' => 'Email sign-in is not set up on this server yet.'], 503);
  $count = function (string $sql, array $args) use ($db): int { $q = $db->prepare($sql); $q->execute($args); return (int) $q->fetchColumn(); };
  if ($count('SELECT COUNT(*) FROM login_codes WHERE email = ? AND created_at > NOW() - INTERVAL 15 MINUTE', [$email]) >= 3) eb_json(['error' => 'Too many codes for this address. Wait 15 minutes and try again.'], 429);
  if ($count('SELECT COUNT(*) FROM login_codes WHERE ip = ? AND created_at > NOW() - INTERVAL 1 HOUR', [$ip]) >= 20) eb_json(['error' => 'Too many sign-in attempts from here. Try again later.'], 429);
  // Caps total mail so rotating IPs and addresses can't burn the mailbox's daily send limit.
  if ($count('SELECT COUNT(*) FROM login_codes WHERE created_at > NOW() - INTERVAL 1 HOUR', []) >= 150) { eb_log('email-login', 'hourly cap hit'); eb_json(['error' => 'Sign-in is busy right now. Try again in a little while.'], 429); }
  $db->exec('DELETE FROM login_codes WHERE expires_at < NOW() - INTERVAL 1 DAY');

  $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
  $db->prepare('INSERT INTO login_codes (email, code_hash, ip, expires_at) VALUES (?, ?, ?, NOW() + INTERVAL 10 MINUTE)')
    ->execute([$email, password_hash($code, PASSWORD_DEFAULT), $ip]);
  $text = "Your Electronics Bench sign-in code is $code\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this email.\n\nhttps://electrify.getparth.com";
  $html = '<div style="font-family:system-ui,sans-serif;font-size:15px;color:#1d1d1b;max-width:420px">'
    . '<p>Your <b>Electronics Bench</b> sign-in code is</p>'
    . '<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:12px 0">' . $code . '</p>'
    . '<p style="color:#6b6658">It works for 10 minutes. If you did not ask for it, you can ignore this email.</p></div>';
  if (!eb_mail($email, "Your Electronics Bench code: $code", $text, $html)) eb_json(['error' => 'Could not send the email right now. Try again in a minute.'], 503);
  eb_json(['ok' => true]);
}

if (($b['action'] ?? '') === 'verify') {
  $code = preg_replace('/\D/', '', (string) ($b['code'] ?? ''));
  $q = $db->prepare('SELECT id, code_hash, attempts FROM login_codes WHERE email = ? AND expires_at > NOW() ORDER BY id DESC LIMIT 1');
  $q->execute([$email]);
  $row = $q->fetch();
  if (!$row) eb_json(['error' => 'That code has expired. Ask for a new one.'], 400);
  if ((int) $row['attempts'] >= 5) eb_json(['error' => 'Too many wrong tries. Ask for a new code.'], 429);
  if (strlen($code) !== 6 || !password_verify($code, $row['code_hash'])) {
    $db->prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?')->execute([$row['id']]);
    eb_json(['error' => 'That code is not right. Check the email and try again.'], 400);
  }
  // Expire instead of delete, so the send caps still count this code.
  $db->prepare('UPDATE login_codes SET expires_at = NOW() - INTERVAL 1 SECOND WHERE email = ? AND expires_at > NOW()')->execute([$email]);

  $q = $db->prepare('SELECT id FROM users WHERE LOWER(email) = ? ORDER BY id LIMIT 1');
  $q->execute([$email]);
  $id = $q->fetchColumn();
  if ($id) $db->prepare('UPDATE users SET last_login = NOW() WHERE id = ?')->execute([$id]);
  else {
    $db->prepare('INSERT INTO users (email, name, last_login) VALUES (?, ?, NOW())')->execute([$email, explode('@', $email)[0]]);
    $id = $db->lastInsertId();
  }
  session_regenerate_id(true);
  $_SESSION['uid'] = (int) $id;
  eb_json(['ok' => true]);
}

eb_json(['error' => 'Unknown action'], 400);
