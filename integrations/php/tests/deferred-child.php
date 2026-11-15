<?php
/**
 * Child process for test.php: simulates a form handler that calls the helper
 * in the default (deferred) mode and then finishes its own output.
 */
require __DIR__ . '/../rate1.php';

$_POST = array('r1_pv' => 'Qm7Xk2Lp9Rt4Vb8N', 'r1_path' => '/contact', 'message' => 'private');
define('RATE1_SITE_SECRET', 'sk_0123456789abcdefghijABCDEFGHIJ0123456789');

$scheduled = rate1_send_request('deferred', array('endpoint' => $argv[1]));
echo ($scheduled ? 'scheduled' : 'not scheduled') . ', transport ' . (function_exists('curl_init') ? 'curl' : 'streams');
