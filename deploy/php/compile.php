<?php
// Arduino compile endpoint for shared hosting: runs arduino-cli via proc_open (exec is often disabled).
declare(strict_types=1);

$TOOLS = getenv('EB_TOOLS') ?: '__TOOLS__';
$BOARDS = ['uno' => 'arduino:avr:uno', 'nano' => 'arduino:avr:nano'];
$MAX_SOURCE = 64 * 1024;
$SLOTS = 2;
$RATE = [30, 600];

header('Content-Type: application/json');
header('Cache-Control: no-store');
$reply = function (array $body, int $status = 200) { http_response_code($status); echo json_encode($body); exit; };
if ($_SERVER['REQUEST_METHOD'] !== 'POST') $reply(['ok' => false, 'log' => 'POST only'], 405);

$in = json_decode((string) file_get_contents('php://input'), true);
$code = is_array($in) && is_string($in['code'] ?? null) ? $in['code'] : '';
$board = is_array($in) && is_string($in['board'] ?? null) && isset($BOARDS[$in['board']]) ? $in['board'] : 'uno';
if (trim($code) === '') $reply(['ok' => false, 'log' => 'The sketch is empty.'], 400);
if (strlen($code) > $MAX_SOURCE) $reply(['ok' => false, 'log' => 'The sketch is too large (64 KB max).'], 413);

$state = "$TOOLS/state";
@mkdir("$state/rate", 0700, true);
@mkdir("$TOOLS/cache", 0700, true);

$key = hash('sha256', $board . "\0" . $code);
$cacheFile = "$TOOLS/cache/$key.json";
if (is_file($cacheFile)) { $hit = json_decode((string) file_get_contents($cacheFile), true); $hit['cached'] = true; $reply($hit); }

$ip = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
$rf = fopen("$state/rate/$ip", 'c+');
flock($rf, LOCK_EX);
$now = time();
$hits = array_values(array_filter(array_map('intval', explode(',', (string) stream_get_contents($rf))), fn($t) => $t > $now - $RATE[1]));
if (count($hits) >= $RATE[0]) { flock($rf, LOCK_UN); $reply(['ok' => false, 'log' => 'Too many compiles from this network. Try again in a few minutes.'], 429); }
$hits[] = $now;
ftruncate($rf, 0); rewind($rf); fwrite($rf, implode(',', $hits)); fflush($rf); flock($rf, LOCK_UN); fclose($rf);

$lock = null;
for ($wait = 0; $wait < 120 && !$lock; $wait++) {
  for ($i = 0; $i < $SLOTS; $i++) {
    $h = fopen("$state/slot$i.lock", 'c');
    if (flock($h, LOCK_EX | LOCK_NB)) { $lock = $h; break; }
    fclose($h);
  }
  if (!$lock) usleep(500000);
}
if (!$lock) $reply(['ok' => false, 'log' => 'The compiler is busy. Try again.'], 503);

$dir = "$TOOLS/tmp/" . bin2hex(random_bytes(8));
$sketch = "$dir/sketch";
mkdir($sketch, 0700, true);
file_put_contents("$sketch/sketch.ino", $code);
$env = [
  'HOME' => dirname($TOOLS), 'PATH' => '/usr/bin:/bin',
  'ARDUINO_DIRECTORIES_DATA' => "$TOOLS/arduino15", 'ARDUINO_DIRECTORIES_DOWNLOADS' => "$TOOLS/arduino15/staging",
  'ARDUINO_DIRECTORIES_USER' => "$TOOLS/arduino-user",
];
$cmd = ["$TOOLS/bin/arduino-cli", 'compile', '--no-color', '--fqbn', $BOARDS[$board], '--output-dir', "$dir/out", $sketch];
$p = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $dir, $env);
$out = ''; $start = time();
stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
while (true) {
  $r = [$pipes[1], $pipes[2]]; $w = null; $e = null;
  if (stream_select($r, $w, $e, 1) > 0) foreach ($r as $s) $out .= (string) fread($s, 65536);
  $st = proc_get_status($p);
  if (!$st['running']) { $out .= stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]); break; }
  if (time() - $start > 90) { proc_terminate($p, 9); $out .= "\nCompile timed out."; break; }
}
$rc = proc_close($p);
if (isset($st['exitcode']) && $st['exitcode'] >= 0) $rc = $st['exitcode'];

$log = str_replace(["$sketch/", $dir], ['', ''], $out);
$log = preg_replace('/\x1b\[[0-9;]*m/', '', $log);
$log = trim(implode("\n", array_filter(explode("\n", $log), fn($l) => !preg_match('/^(Used (platform|library)|arduino:avr\s)/', trim($l)))));
$hexFile = "$dir/out/sketch.ino.hex";
$result = ($rc === 0 && is_file($hexFile)) ? ['ok' => true, 'hex' => file_get_contents($hexFile), 'log' => $log] : ['ok' => false, 'log' => $log ?: 'Compile failed.'];
if ($result['ok']) file_put_contents($cacheFile, json_encode($result));

$rm = function (string $path) use (&$rm) { if (is_dir($path)) { foreach (scandir($path) as $f) if ($f !== '.' && $f !== '..') $rm("$path/$f"); rmdir($path); } elseif (file_exists($path)) unlink($path); };
$rm($dir);
flock($lock, LOCK_UN); fclose($lock);
$reply($result);
