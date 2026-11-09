<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

$u = eb_require_user();
$db = eb_db();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $q = $db->prepare('SELECT lesson_id, steps, quiz, done FROM progress WHERE user_id = ?');
  $q->execute([$u['id']]);
  $out = [];
  foreach ($q as $r) $out[$r['lesson_id']] = ['steps' => (int) $r['steps'], 'quiz' => json_decode($r['quiz'] ?? '{}', true) ?: new stdClass, 'done' => (bool) $r['done']];
  eb_json(['progress' => $out]);
}

$b = eb_require_post();
$items = is_array($b['items'] ?? null) ? $b['items'] : [];
// Merging keeps the best result, so syncing from two devices never loses progress.
$stmt = $db->prepare('INSERT INTO progress (user_id, lesson_id, steps, quiz, done) VALUES (?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE steps = GREATEST(steps, VALUES(steps)), quiz = VALUES(quiz), done = GREATEST(done, VALUES(done))');
$n = 0;
foreach (array_slice($items, 0, 500, true) as $lesson => $p) {
  if (!is_string($lesson) || !preg_match('/^[a-z0-9\-]{1,64}$/', $lesson) || !is_array($p)) continue;
  $quiz = is_array($p['quiz'] ?? null) ? array_slice($p['quiz'], 0, 50, true) : [];
  $stmt->execute([$u['id'], $lesson, max(0, min(100, (int) ($p['steps'] ?? 0))), json_encode((object) $quiz), !empty($p['done']) ? 1 : 0]);
  $n++;
}
eb_json(['ok' => true, 'saved' => $n]);
