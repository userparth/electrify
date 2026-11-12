<?php
declare(strict_types=1);

const EB_TOOLS = '__TOOLS__';

function eb_config(): array {
  static $c = null;
  if ($c === null) {
    $file = (getenv('EB_TOOLS') ?: EB_TOOLS) . '/config.php';
    $c = is_file($file) ? require $file : [];
  }
  return $c;
}

/** Appends one line to the server's error log, kept outside the web folder and rotated at 1 MB. */
function eb_log(string $kind, string $msg): void {
  $dir = (getenv('EB_TOOLS') ?: EB_TOOLS) . '/logs';
  if (!is_dir($dir) && !@mkdir($dir, 0700, true)) { error_log("eb $kind: $msg"); return; }
  $file = "$dir/errors.log";
  if (@filesize($file) > 1 << 20) @rename($file, "$file.1");
  $line = json_encode(['t' => gmdate('c'), 'kind' => $kind, 'msg' => mb_substr($msg, 0, 2000), 'url' => $_SERVER['REQUEST_URI'] ?? '']);
  @file_put_contents($file, $line . "\n", FILE_APPEND | LOCK_EX);
}

set_exception_handler(function (Throwable $e) {
  eb_log('php', get_class($e) . ': ' . $e->getMessage() . ' at ' . basename($e->getFile()) . ':' . $e->getLine());
  if (PHP_SAPI === 'cli') { fwrite(STDERR, $e->getMessage() . "\n"); exit(1); }
  eb_json(['error' => 'Something went wrong on the server. Try again.'], 500);
});

function eb_json($body, int $status = 200): never {
  http_response_code($status);
  header('Content-Type: application/json');
  header('Cache-Control: no-store');
  echo json_encode($body);
  exit;
}

function eb_db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  $db = eb_config()['db'] ?? [];
  if (empty($db['name'])) eb_json(['error' => 'Accounts are not set up on this server yet.'], 503);
  $pdo = new PDO("mysql:host={$db['host']};dbname={$db['name']};charset=utf8mb4", $db['user'], $db['pass'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);
  return $pdo;
}

function eb_session(): void {
  if (session_status() === PHP_SESSION_ACTIVE) return;
  session_name('eb_sess');
  session_set_cookie_params(['lifetime' => 60 * 60 * 24 * 30, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
  ini_set('session.gc_maxlifetime', (string) (60 * 60 * 24 * 30));
  session_start();
}

function eb_user(): ?array {
  eb_session();
  $id = $_SESSION['uid'] ?? null;
  if (!$id) return null;
  $q = eb_db()->prepare('SELECT id, email, name, picture, role, settings FROM users WHERE id = ?');
  $q->execute([$id]);
  $u = $q->fetch();
  if (!$u) return null;
  $u['settings'] = $u['settings'] ? json_decode($u['settings'], true) : null;
  return $u;
}

function eb_require_user(): array {
  $u = eb_user();
  if (!$u) eb_json(['error' => 'Sign in first.'], 401);
  return $u;
}

/** State-changing calls must come from our own pages (a custom header can't be sent cross-site without CORS). */
function eb_require_post(): array {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') eb_json(['error' => 'POST only'], 405);
  if (($_SERVER['HTTP_X_EB'] ?? '') !== '1') eb_json(['error' => 'Bad request'], 400);
  $body = json_decode((string) file_get_contents('php://input'), true);
  return is_array($body) ? $body : [];
}

function eb_class_code(): string {
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  $s = '';
  for ($i = 0; $i < 6; $i++) $s .= $alphabet[random_int(0, strlen($alphabet) - 1)];
  return $s;
}

function eb_mail_ready(): bool {
  $m = eb_config()['mail'] ?? [];
  return !empty($m['user']) && !empty($m['pass']);
}

/** Sends one multipart email over SMTPS with AUTH LOGIN; returns false (and logs why) on any failure. */
function eb_mail(string $to, string $subject, string $text, string $html): bool {
  $m = eb_config()['mail'] ?? [];
  if (!eb_mail_ready() || !filter_var($to, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $to)) return false;
  $host = $m['host'] ?? 'smtp.hostinger.com';
  $fp = @stream_socket_client('ssl://' . $host . ':' . (int) ($m['port'] ?? 465), $errno, $err, 15);
  if (!$fp) { eb_log('mail', "connect failed: $err"); return false; }
  stream_set_timeout($fp, 15);
  $read = function () use ($fp): string {
    $out = '';
    while (($line = fgets($fp, 1024)) !== false) { $out .= $line; if (strlen($line) < 4 || $line[3] === ' ') break; }
    return $out;
  };
  $cmd = function (string $line, string $expect) use ($fp, $read): void {
    if ($line !== '') fwrite($fp, $line . "\r\n");
    $reply = $read();
    if (strncmp($reply, $expect, 3) !== 0) throw new RuntimeException(trim($reply));
  };
  $from = $m['from'] ?? $m['user'];
  $domain = substr(strrchr($from, '@') ?: '@localhost', 1);
  try {
    $cmd('', '220');
    $cmd('EHLO ' . $domain, '250');
    $cmd('AUTH LOGIN', '334');
    $cmd(base64_encode($m['user']), '334');
    $cmd(base64_encode($m['pass']), '235');
    $cmd("MAIL FROM:<$from>", '250');
    $cmd("RCPT TO:<$to>", '250');
    $cmd('DATA', '354');
    $b = bin2hex(random_bytes(12));
    $msg = implode("\r\n", [
      'From: ' . mb_encode_mimeheader($m['from_name'] ?? 'Electronics Bench') . " <$from>",
      "To: <$to>",
      'Subject: ' . mb_encode_mimeheader($subject),
      'Date: ' . date('r'),
      'Message-ID: <' . bin2hex(random_bytes(10)) . "@$domain>",
      'MIME-Version: 1.0',
      "Content-Type: multipart/alternative; boundary=\"$b\"",
      '',
      "--$b", 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', $text,
      "--$b", 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', $html,
      "--$b--",
    ]);
    // Normalise line endings, then dot-stuff lines that start with "." (RFC 5321 §4.5.2).
    $msg = preg_replace('/^\./m', '..', str_replace("\n", "\r\n", str_replace("\r\n", "\n", $msg)));
    $cmd($msg . "\r\n.", '250');
    // The message is accepted at this point; a failed QUIT must not report it as unsent.
    try { $cmd('QUIT', '221'); } catch (Throwable $_) {}
    return true;
  } catch (Throwable $e) {
    eb_log('mail', $e->getMessage());
    return false;
  } finally {
    fclose($fp);
  }
}
