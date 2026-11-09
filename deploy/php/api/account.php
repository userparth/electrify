<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

$u = eb_require_user();
$b = eb_require_post();

if (($b['action'] ?? '') === 'delete') {
  // Classes, enrollments, assignments and progress go with the user through ON DELETE CASCADE.
  eb_db()->prepare('DELETE FROM users WHERE id = ?')->execute([$u['id']]);
  $_SESSION = [];
  session_destroy();
  eb_json(['ok' => true]);
}

eb_json(['error' => 'Unknown action'], 400);
