<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

$u = eb_require_user();
$db = eb_db();

function eb_assigned(PDO $db, int $classId): array {
  $q = $db->prepare('SELECT lesson_id FROM class_lessons WHERE class_id = ? ORDER BY assigned_at, lesson_id');
  $q->execute([$classId]);
  return $q->fetchAll(PDO::FETCH_COLUMN);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $t = $db->prepare('SELECT id, name, code, created_at FROM classes WHERE teacher_id = ? ORDER BY created_at DESC');
  $t->execute([$u['id']]);
  $teaching = [];
  foreach ($t as $c) {
    $s = $db->prepare('SELECT u.id, u.name, u.email, u.picture FROM enrollments e JOIN users u ON u.id = e.user_id WHERE e.class_id = ? ORDER BY u.name');
    $s->execute([$c['id']]);
    $students = $s->fetchAll();
    $p = $db->prepare('SELECT p.user_id, p.lesson_id, p.steps, p.done FROM progress p JOIN enrollments e ON e.user_id = p.user_id WHERE e.class_id = ?');
    $p->execute([$c['id']]);
    $prog = [];
    foreach ($p as $r) $prog[$r['user_id']][$r['lesson_id']] = ['steps' => (int) $r['steps'], 'done' => (bool) $r['done']];
    foreach ($students as &$st) { $st['progress'] = $prog[$st['id']] ?? new stdClass; unset($st['id']); }
    unset($st);
    $id = $c['id']; unset($c['id']);
    $teaching[] = $c + ['students' => $students, 'assigned' => eb_assigned($db, (int) $id)];
  }
  $e = $db->prepare('SELECT c.id, c.name, c.code, t.name AS teacher FROM enrollments e JOIN classes c ON c.id = e.class_id JOIN users t ON t.id = c.teacher_id WHERE e.user_id = ?');
  $e->execute([$u['id']]);
  $enrolled = [];
  foreach ($e as $c) { $id = $c['id']; unset($c['id']); $enrolled[] = $c + ['assigned' => eb_assigned($db, (int) $id)]; }
  eb_json(['teaching' => $teaching, 'enrolled' => $enrolled]);
}

$b = eb_require_post();
$action = $b['action'] ?? '';

if ($action === 'create') {
  $name = trim(mb_substr((string) ($b['name'] ?? ''), 0, 120));
  if ($name === '') eb_json(['error' => 'Give the class a name.'], 400);
  $db->prepare("UPDATE users SET role = 'teacher' WHERE id = ?")->execute([$u['id']]);
  for ($try = 0; $try < 5; $try++) {
    try {
      $code = eb_class_code();
      $db->prepare('INSERT INTO classes (teacher_id, name, code) VALUES (?, ?, ?)')->execute([$u['id'], $name, $code]);
      eb_json(['ok' => true, 'code' => $code]);
    } catch (PDOException $e) { if ($e->getCode() !== '23000') throw $e; }
  }
  eb_json(['error' => 'Could not create a class code, try again.'], 500);
}

if ($action === 'join') {
  $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) ($b['code'] ?? '')));
  $q = $db->prepare('SELECT id, name FROM classes WHERE code = ?');
  $q->execute([$code]);
  $c = $q->fetch();
  if (!$c) eb_json(['error' => 'No class with that code.'], 404);
  $db->prepare('INSERT IGNORE INTO enrollments (class_id, user_id) VALUES (?, ?)')->execute([$c['id'], $u['id']]);
  eb_json(['ok' => true, 'name' => $c['name']]);
}

if ($action === 'assign') {
  $q = $db->prepare('SELECT id FROM classes WHERE code = ? AND teacher_id = ?');
  $q->execute([(string) ($b['code'] ?? ''), $u['id']]);
  $classId = $q->fetchColumn();
  if (!$classId) eb_json(['error' => 'No such class.'], 404);
  $ids = array_values(array_unique(array_filter((array) ($b['lessons'] ?? []), fn($x) => is_string($x) && preg_match('/^[a-z0-9-]{1,64}$/', $x))));
  if (count($ids) > 300) eb_json(['error' => 'Too many lessons.'], 400);
  $db->beginTransaction();
  $keep = $ids ? implode(',', array_fill(0, count($ids), '?')) : "''";
  $db->prepare("DELETE FROM class_lessons WHERE class_id = ? AND lesson_id NOT IN ($keep)")->execute([$classId, ...$ids]);
  $ins = $db->prepare('INSERT IGNORE INTO class_lessons (class_id, lesson_id) VALUES (?, ?)');
  foreach ($ids as $id) $ins->execute([$classId, $id]);
  $db->commit();
  eb_json(['ok' => true, 'assigned' => eb_assigned($db, (int) $classId)]);
}

if ($action === 'delete') {
  $db->prepare('DELETE FROM classes WHERE code = ? AND teacher_id = ?')->execute([(string) ($b['code'] ?? ''), $u['id']]);
  eb_json(['ok' => true]);
}

eb_json(['error' => 'Unknown action'], 400);
