<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

$b = eb_require_post();
eb_session();
// A per-session budget keeps one broken or hostile tab from filling the log.
$_SESSION['eb_logs'] = ($_SESSION['eb_logs'] ?? 0) + 1;
if ($_SESSION['eb_logs'] > 30) eb_json(['ok' => true]);
$msg = trim(preg_replace('/[\x00-\x1f]+/', ' ', (string) ($b['msg'] ?? '')));
if ($msg === '') eb_json(['error' => 'Empty'], 400);
$where = mb_substr(preg_replace('/[\x00-\x1f]+/', ' ', (string) ($b['where'] ?? '')), 0, 300);
eb_log('client', mb_substr($msg, 0, 1500) . ($where !== '' ? " @ $where" : '') . ' | ' . mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 160));
eb_json(['ok' => true]);
