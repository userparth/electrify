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
  $q = eb_db()->prepare('SELECT id, email, name, picture, role FROM users WHERE id = ?');
  $q->execute([$id]);
  return $q->fetch() ?: null;
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
