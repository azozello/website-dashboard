<?php
/**
 * Tests for integrations/php/rate1.php.
 *
 *   php integrations/php/tests/test.php
 *
 * Needs the mock collector for the network part (skipped if it isn't running):
 *   cd contract/mock-collector && PORT=4010 node server.mjs
 *   R1_MOCK_URL=http://127.0.0.1:4010 (default)
 */

error_reporting(E_ALL);
require __DIR__ . '/../rate1.php';

const SECRET = 'sk_0123456789abcdefghijABCDEFGHIJ0123456789';
const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

$pass = 0;
$fail = 0;
function check($cond, $msg)
{
    global $pass, $fail;
    if ($cond) {
        $pass++;
        echo "  ok   $msg\n";
    } else {
        $fail++;
        echo "  FAIL $msg\n";
    }
}
function same($a, $b, $msg)
{
    check($a === $b, $msg . ($a === $b ? '' : ' — expected ' . var_export($b, true) . ', got ' . var_export($a, true)));
}

$mock = rtrim(getenv('R1_MOCK_URL') ?: 'http://127.0.0.1:4010', '/');
function http($method, $url, $body = null)
{
    $ctx = stream_context_create(array('http' => array(
        'method' => $method,
        'header' => "Content-Type: application/json\r\n",
        'content' => $body === null ? '' : json_encode($body),
        'ignore_errors' => true,
        'timeout' => 5,
    )));
    $r = @file_get_contents($url, false, $ctx);
    return $r === false ? null : json_decode($r, true);
}
function calls()
{
    global $mock;
    return http('GET', $mock . '/_calls?endpoint=/v1/r');
}

echo 'PHP ' . PHP_VERSION . "\n";

echo "\n# Path normaliser: contract/v1/path-normalisation.json\n";
$vectors = json_decode(file_get_contents(__DIR__ . '/../../../contract/v1/path-normalisation.json'), true);
foreach ($vectors['cases'] as $case) {
    same(rate1_normalise_path($case[0]), $case[1], 'normalise(' . json_encode($case[0], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . ')');
}

echo "\n# Payload\n";
$_POST = array(
    'r1_pv' => 'Qm7Xk2Lp9Rt4Vb8N',
    'r1_path' => '/back-pain',
    'name' => 'Jane Secretname',
    'email' => 'jane.secret@example.test',
    'message' => 'my private message',
);
$p = rate1_build_payload('contact');
$keys = array_keys($p);
same($keys, array('v', 'rid', 'ts', 'pv', 'path', 'channel', 'source', 'form_id', 'spam', 'spam_reason'), 'exactly the §6 keys');
check(preg_match('/^custom:contact:' . UUID_RE . '$/', $p['rid']) === 1, 'rid custom:contact:<uuid4>');
same(array($p['pv'], $p['path'], $p['source'], $p['channel'], $p['form_id'], $p['spam'], $p['spam_reason']), array('Qm7Xk2Lp9Rt4Vb8N', '/back-pain', 'custom', 'form', 'contact', false, null), 'pv, path, source custom, channel, form_id, spam');
check(is_int($p['ts']) && abs($p['ts'] - time() * 1000) < 5000, 'ts = server Unix ms');
$json = json_encode($p);
check(strpos($json, 'Secretname') === false && strpos($json, 'jane.secret') === false && strpos($json, 'private') === false, 'no field values');
same(rate1_build_payload('contact')['rid'], $p['rid'], 'rid stable for the same form within one request');
same(rate1_build_payload('booking-form', array('channel' => 'booking', 'spam' => true, 'spam_reason' => 'too_fast'))['channel'], 'booking', 'channel option');
same(rate1_build_payload('x', array('spam' => true, 'spam_reason' => 'too_fast'))['spam_reason'], 'too_fast', 'spam_reason with spam');
same(rate1_build_payload('y', array('spam' => false, 'spam_reason' => 'too_fast'))['spam_reason'], null, 'spam_reason null without spam');
same(rate1_build_payload(''), null, 'empty form id → null');
same(strlen(rate1_build_payload(str_repeat('f', 150))['form_id']), 100, 'form_id truncated to 100');
check(strlen(rate1_build_payload(str_repeat('g', 150))['rid']) <= 120, 'rid ≤ 120');
$_POST = array('r1_pv' => 'bad!', 'r1_path' => 'nope');
$_SERVER['HTTP_HOST'] = 'www.site.example';
$_SERVER['HTTP_REFERER'] = 'https://site.example/Kontakt/?utm_source=x';
$p = rate1_build_payload('contact2');
same(array($p['pv'], $p['path']), array(null, '/Kontakt'), 'bad r1_pv → null; bad r1_path → same-site Referer path');
$_SERVER['HTTP_REFERER'] = 'https://evil.example/Kontakt/';
same(rate1_build_payload('contact3')['path'], null, 'cross-site Referer → null');
unset($_SERVER['HTTP_REFERER']);

echo "\n# Never throws, never prints\n";
ini_set('display_errors', '1');
ob_start();
$r1 = rate1_send_request('contact', array('secret' => 'sk_bad', 'defer' => false));
$r2 = rate1_send_request(array('not', 'a', 'string'), array('secret' => SECRET, 'defer' => false, 'endpoint' => 'http://127.0.0.1:9'));
$r3 = rate1_send_request('contact', array('secret' => array(), 'defer' => false, 'endpoint' => array()));
$t = microtime(true);
$r4 = rate1_send_request('contact', array('secret' => SECRET, 'defer' => false, 'endpoint' => 'http://127.0.0.1:9'));
$took = microtime(true) - $t;
$out = ob_get_clean();
same($r1, false, 'invalid secret → false');
same($r2, false, 'array as form id → false');
same($r3, false, 'arrays as options → false');
same($r4, false, 'unreachable collector → false');
check($took < 3.5, 'returns within the 3 s timeout');
same($out, '', 'nothing printed (display_errors on)');

echo "\n# Against the mock collector ($mock)\n";
if (http('POST', $mock . '/_reset', array()) === null) {
    echo "  SKIP mock collector not reachable\n";
} else {
    $_POST = array('r1_pv' => 'Qm7Xk2Lp9Rt4Vb8N', 'r1_path' => '/back-pain', 'email' => 'jane.secret@example.test');
    same(rate1_send_request('contact-mock', array('secret' => SECRET, 'defer' => false, 'endpoint' => $mock)), true, 'immediate send → true (202)');
    $c = calls();
    same(count($c), 1, 'one call recorded');
    same($c[0]['valid'], true, 'valid against server-request.schema.json ' . json_encode($c[0]['errors']));
    same($c[0]['auth_ok'], true, 'Bearer site secret');
    same($c[0]['headers']['user-agent'], 'rate1-php/0.1.0', 'own user agent, not the visitor\'s');
    check(strpos(json_encode($c[0]), 'jane.secret') === false, 'no field values sent');

    http('POST', $mock . '/_reset', array());
    http('POST', $mock . '/_fail', array('endpoint' => '/v1/r', 'count' => 1, 'status' => 503));
    same(rate1_send_request('contact-mock', array('secret' => SECRET, 'defer' => false, 'endpoint' => $mock)), false, '503 → false, no exception');

    http('POST', $mock . '/_reset', array());
    http('POST', $mock . '/_fail', array('endpoint' => '/v1/r', 'count' => 1, 'status' => 503, 'delay_ms' => 6000));
    $t = microtime(true);
    same(rate1_send_request('contact-mock', array('secret' => SECRET, 'defer' => false, 'endpoint' => $mock)), false, 'slow collector → false');
    $took = microtime(true) - $t;
    check($took < 4, sprintf('gave up after %.1f s (3 s timeout)', $took));

    // Deferred mode: the call happens at shutdown of a separate PHP process.
    // Run once with the normal php.ini and once with -n (no extensions: curl absent → PHP streams).
    foreach (array(array(), array('-n')) as $flags) {
        http('POST', $mock . '/_reset', array());
        $cmd = escapeshellarg(PHP_BINARY) . ' ' . implode(' ', $flags) . ' ' . escapeshellarg(__DIR__ . '/deferred-child.php') . ' ' . escapeshellarg($mock);
        $out = shell_exec($cmd);
        $c = calls();
        $label = trim((string) $out);
        same(count($c), 1, "deferred send at shutdown ($label)");
        if (count($c) === 1) {
            same(array($c[0]['valid'], $c[0]['auth_ok'], $c[0]['body']['form_id'], $c[0]['body']['pv']), array(true, true, 'deferred', 'Qm7Xk2Lp9Rt4Vb8N'), "valid deferred call ($label)");
        }
    }
}

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
