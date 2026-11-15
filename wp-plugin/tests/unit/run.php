<?php
/**
 * Runs every unit test file in this folder. Exit code 1 on any failure.
 *
 *   php wp-plugin/tests/unit/run.php
 *   R1_MOCK_URL=http://127.0.0.1:4010 php wp-plugin/tests/unit/run.php   (also validate payloads with the JSON Schemas)
 */

require __DIR__ . '/bootstrap.php';

echo 'PHP ' . PHP_VERSION . "\n";
foreach ( glob( __DIR__ . '/test-*.php' ) as $file ) {
	WP_Stub::reset();
	Rate1_Connector_Forms::reset();
	require $file;
}

echo "\n" . T::$pass . ' passed, ' . T::$fail . " failed\n";
exit( T::$fail ? 1 : 0 );
