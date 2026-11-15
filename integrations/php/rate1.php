<?php
/**
 * Rate 1 — server request helper for custom PHP sites (Data contract v1 §6).
 *
 * Call rate1_send_request() from your form handler after it has accepted a
 * submission. It tells Rate 1 that a request happened on the page the visitor
 * was on. It reads only the r1_pv and r1_path hidden fields that r1.js adds to
 * every form. It never sends field values, the visitor's IP address or user
 * agent, never throws and never prints anything.
 *
 *   require_once __DIR__ . '/rate1.php';
 *   define('RATE1_SITE_SECRET', 'sk_…');
 *   rate1_send_request('contact');
 *
 * PHP 7.4+, no dependencies (uses curl if available, else PHP streams).
 * Version 0.1.0. License: GPL-2.0-or-later.
 */

if (!function_exists('rate1_send_request')) {

    /**
     * Report one accepted form submission to Rate 1.
     *
     * By default the call is made at the end of the request (after the
     * response is sent when PHP-FPM or LiteSpeed allows it), with a 3 s timeout.
     *
     * @param string $formId  Your name for the form, e.g. "contact" (max 100 chars).
     * @param array  $options Optional:
     *                        'secret'      site secret (default: RATE1_SITE_SECRET constant or env var)
     *                        'spam'        bool, your own spam verdict (default false)
     *                        'spam_reason' 'honeypot', 'plugin' or 'too_fast' (only with spam)
     *                        'channel'     'form' (default), 'booking' or 'calculator'
     *                        'defer'       true (default): send at shutdown; false: send now and return the result
     *                        'endpoint'    collector base URL (default https://collect.bazed.live; for tests)
     * @return bool When deferred: true if the request was valid and scheduled. Otherwise: true if accepted (HTTP 200/202).
     */
    function rate1_send_request($formId, array $options = array())
    {
        // Never print a warning into the host page, never throw.
        set_error_handler(function () {
            return true;
        });
        try {
            $secret = isset($options['secret']) && is_string($options['secret']) ? $options['secret']
                : (defined('RATE1_SITE_SECRET') ? (string) constant('RATE1_SITE_SECRET') : (string) getenv('RATE1_SITE_SECRET'));
            if (!preg_match('/^sk_[0-9A-Za-z]{40}$/', $secret)) {
                return false;
            }
            $payload = rate1_build_payload($formId, $options);
            if ($payload === null) {
                return false;
            }
            $base = isset($options['endpoint']) && is_string($options['endpoint']) ? $options['endpoint'] : 'https://collect.bazed.live';
            $endpoint = rtrim($base, '/') . '/v1/r';

            if (array_key_exists('defer', $options) && !$options['defer']) {
                return rate1_post($endpoint, $secret, $payload);
            }
            register_shutdown_function(function () use ($endpoint, $secret, $payload) {
                set_error_handler(function () {
                    return true;
                });
                try {
                    if (function_exists('fastcgi_finish_request')) {
                        fastcgi_finish_request();
                    } elseif (function_exists('litespeed_finish_request')) {
                        litespeed_finish_request();
                    }
                    rate1_post($endpoint, $secret, $payload);
                } catch (\Throwable $e) {
                    // Never disturb the host application.
                } finally {
                    restore_error_handler();
                }
            });
            return true;
        } catch (\Throwable $e) {
            return false;
        } finally {
            restore_error_handler();
        }
    }

    /**
     * Build the POST /v1/r body. Returns null if the form id is empty.
     *
     * @internal
     */
    function rate1_build_payload($formId, array $options = array())
    {
        if (!is_scalar($formId)) {
            return null;
        }
        $formId = trim((string) preg_replace('/[\x00-\x1F\x7F]/', '', (string) $formId));
        $formId = rate1_truncate($formId, 100);
        if ($formId === '') {
            return null;
        }
        static $rids = array();
        if (!isset($rids[$formId])) {
            $b = random_bytes(16);
            $b[6] = chr(ord($b[6]) & 0x0f | 0x40);
            $b[8] = chr(ord($b[8]) & 0x3f | 0x80);
            $uuid = vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
            $room = 120 - strlen('custom::') - strlen($uuid);
            $id = substr($formId, 0, $room);
            $rids[$formId] = 'custom:' . (preg_match('//u', $id) ? $id : md5($formId)) . ':' . $uuid;
        }

        $spam = !empty($options['spam']);
        $reason = isset($options['spam_reason']) ? $options['spam_reason'] : null;
        $channel = isset($options['channel']) ? $options['channel'] : 'form';

        return array(
            'v' => 1,
            'rid' => $rids[$formId],
            'ts' => (int) floor(microtime(true) * 1000),
            'pv' => rate1_read_pv(),
            'path' => rate1_read_path(),
            'channel' => in_array($channel, array('form', 'booking', 'calculator'), true) ? $channel : 'form',
            'source' => 'custom',
            'form_id' => $formId,
            'spam' => $spam,
            'spam_reason' => $spam ? (in_array($reason, array('honeypot', 'plugin', 'too_fast'), true) ? $reason : null) : null,
        );
    }

    /**
     * Page token from the r1_pv hidden field, or null.
     *
     * @internal
     */
    function rate1_read_pv()
    {
        $pv = isset($_POST['r1_pv']) && is_string($_POST['r1_pv']) ? $_POST['r1_pv'] : '';
        return preg_match('/^[0-9A-Za-z]{16}$/', $pv) ? $pv : null;
    }

    /**
     * Path from the r1_path hidden field; else this site's HTTP Referer path, normalised; else null.
     *
     * @internal
     */
    function rate1_read_path()
    {
        $raw = isset($_POST['r1_path']) && is_string($_POST['r1_path']) ? $_POST['r1_path'] : '';
        if ($raw !== '' && $raw[0] === '/' && preg_match('//u', $raw)) {
            return rate1_truncate((string) preg_replace('/[\x00-\x1F\x7F]/', '', $raw), 512);
        }
        $ref = isset($_SERVER['HTTP_REFERER']) && is_string($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';
        if ($ref === '') {
            return null;
        }
        $refHost = parse_url($ref, PHP_URL_HOST);
        if (is_string($refHost) && $refHost !== '') {
            $host = isset($_SERVER['HTTP_HOST']) ? (string) parse_url('http://' . $_SERVER['HTTP_HOST'], PHP_URL_HOST) : '';
            $bare = function ($h) {
                $h = strtolower($h);
                return strpos($h, 'www.') === 0 ? substr($h, 4) : $h;
            };
            if ($host === '' || $bare($refHost) !== $bare($host)) {
                return null;
            }
        } elseif ($ref[0] !== '/') {
            return null;
        }
        return rate1_normalise_path($ref);
    }

    /**
     * Path normalisation, Data contract v1 §1 (same rule as r1.js and ingest).
     *
     * @param string $input URL or path.
     * @return string
     */
    function rate1_normalise_path($input)
    {
        $p = is_string($input) ? $input : '';
        $p = (string) preg_replace('~^[a-z][a-z\d+.\-]*://[^/?#]*~i', '', $p);
        $p = (string) preg_split('/[?#]/', $p, 2)[0];
        if (!preg_match('/%(?![0-9a-f]{2})/i', $p)) {
            $decoded = rawurldecode($p);
            if (preg_match('//u', $decoded)) {
                $p = $decoded;
            }
        }
        $p = rtrim($p, '/');
        if ($p === '' || $p[0] !== '/') {
            $p = '/' . $p;
        }
        return rate1_truncate($p, 512);
    }

    /**
     * Truncate to $max characters, UTF-8 safe.
     *
     * @internal
     */
    function rate1_truncate($s, $max)
    {
        if (strlen($s) <= $max) {
            return $s;
        }
        return preg_match('/^.{0,' . (int) $max . '}/us', $s, $m) ? $m[0] : substr($s, 0, $max);
    }

    /**
     * POST the body with a 3 s timeout. Never throws, never prints.
     *
     * @internal
     */
    function rate1_post($url, $secret, array $payload)
    {
        $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($body === false) {
            return false;
        }
        $headers = array(
            'Authorization: Bearer ' . $secret,
            'Content-Type: application/json',
            'User-Agent: rate1-php/0.1.0',
        );
        $status = 0;
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, array(
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $body,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 3,
                CURLOPT_TIMEOUT => 3,
                CURLOPT_FOLLOWLOCATION => false,
            ));
            if (curl_exec($ch) !== false) {
                $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            }
            if (PHP_VERSION_ID < 80000) {
                curl_close($ch);
            }
        } else {
            $ctx = stream_context_create(array('http' => array(
                'method' => 'POST',
                'header' => implode("\r\n", $headers) . "\r\n",
                'content' => $body,
                'timeout' => 3,
                'ignore_errors' => true,
                'follow_location' => 0,
            )));
            set_error_handler(function () {
                return true;
            });
            try {
                $result = file_get_contents($url, false, $ctx);
            } finally {
                restore_error_handler();
            }
            if (function_exists('http_get_last_response_headers')) {
                $responseHeaders = (array) http_get_last_response_headers();
            } else {
                $legacy = 'http_response_header'; // Set by file_get_contents() before PHP 8.4.
                $responseHeaders = isset($$legacy) ? (array) $$legacy : array();
            }
            if ($result !== false && isset($responseHeaders[0]) && preg_match('#^HTTP/\S+\s+(\d{3})#', $responseHeaders[0], $m)) {
                $status = (int) $m[1];
            }
        }
        return $status === 200 || $status === 202;
    }
}
