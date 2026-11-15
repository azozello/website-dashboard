<?php
/**
 * Sender and retry queue with a stubbed HTTP layer.
 */

if ( ! function_exists( 'fastcgi_finish_request' ) ) {
	/** CLI has no FPM: stub it so the "finish response, then send" branch runs. */
	function fastcgi_finish_request() {
		$GLOBALS['finished'] = ( $GLOBALS['finished'] ?? 0 ) + 1;
		return true;
	}
}

function sample_payload( $rid = 'cf7:12:8e1c0f6a-0b7e-4c1e-9a55-2f1d3b6a9c10' ) {
	return array(
		'v'           => 1,
		'rid'         => $rid,
		'ts'          => 1794758475000,
		'pv'          => 'Qm7Xk2Lp9Rt4Vb8N',
		'path'        => '/back-pain',
		'channel'     => 'form',
		'source'      => 'cf7',
		'form_id'     => '12',
		'spam'        => false,
		'spam_reason' => null,
	);
}

/** Make every queued item due now. */
function make_due() {
	$q = get_option( Rate1_Connector_Options::QUEUE );
	foreach ( $q as &$item ) {
		$item['next_at'] = time() - 1;
	}
	update_option( Rate1_Connector_Options::QUEUE, $q );
}

function reset_sender() {
	$r = new ReflectionProperty( 'Rate1_Connector_Sender', 'pending' );
	$r->setAccessible( true );
	$r->setValue( null, array() );
	$h = new ReflectionProperty( "Rate1_Connector_Sender", "hooked" );
	$h->setAccessible( true );
	$h->setValue( null, false );
	WP_Stub::$http      = array();
	WP_Stub::$responses = array();
	WP_Stub::$cron      = array();
	WP_Stub::$spawned   = 0;
	WP_Stub::$filters   = array();
	update_option( Rate1_Connector_Options::QUEUE, array() );
	update_option( Rate1_Connector_Options::DROPPED, 0 );
}

update_option( Rate1_Connector_Options::SITE_SECRET, 'sk_0123456789abcdefghijABCDEFGHIJ0123456789' );

// ------------------------------------------------------------------
T::group( 'Sender: request format' );
reset_sender();
WP_Stub::$responses = array( 202 );
T::eq( Rate1_Connector_Sender::send( sample_payload() ), 'ok', '202 → ok' );
$req = WP_Stub::$http[0];
T::eq( $req['url'], 'https://collect.bazed.live/v1/r', 'POST to RATE1_CONNECTOR_COLLECT_URL/v1/r' );
T::eq( $req['args']['timeout'], 3, 'timeout 3 s' );
T::eq( $req['args']['headers']['Authorization'], 'Bearer sk_0123456789abcdefghijABCDEFGHIJ0123456789', 'Bearer site secret' );
T::eq( $req['args']['headers']['Content-Type'], 'application/json', 'JSON content type' );
T::eq( json_decode( $req['args']['body'], true ), sample_payload(), 'body is the payload, nothing added' );
T::ok( false === strpos( $req['args']['user-agent'], 'Mozilla' ), 'user agent identifies the plugin, not a visitor' );
T::eq( WP_Stub::$autoload[ Rate1_Connector_Options::LAST_SEND ], false, 'last-send status stored with autoload off' );

T::group( 'Sender: status classification' );
foreach ( array( 200 => 'ok', 202 => 'ok', 0 => 'retry', 500 => 'retry', 502 => 'retry', 503 => 'retry', 429 => 'retry', 408 => 'retry', 301 => 'retry', 400 => 'permanent', 401 => 'permanent', 403 => 'permanent', 404 => 'permanent', 413 => 'permanent' ) as $code => $want ) {
	T::eq( Rate1_Connector_Sender::classify( $code ), $want, "HTTP $code → $want" );
}

// ------------------------------------------------------------------
T::group( 'Flush at shutdown: finish the response, send, queue on failure' );
reset_sender();
Rate1_Connector_Sender::add( sample_payload() );
Rate1_Connector_Sender::add( sample_payload() );
T::eq( count( Rate1_Connector_Sender::pending() ), 1, 'same rid added twice → one pending' );
T::ok( ! empty( WP_Stub::$filters['shutdown'] ), 'flush hooked on shutdown' );
WP_Stub::$responses  = array( 503 );
$GLOBALS['finished'] = 0;
do_action( 'shutdown' );
T::eq( $GLOBALS['finished'], 1, 'fastcgi_finish_request() called before sending' );
T::eq( count( WP_Stub::$http ), 1, 'one attempt' );
$q = Rate1_Connector_Sender::queue();
T::eq( count( $q ), 1, '503 → queued' );
T::eq( $q[0]['attempts'], 1, 'attempts = 1' );
T::ok( abs( $q[0]['next_at'] - ( time() + 60 ) ) <= 1, 'retry 1 after 60 s' );
T::eq( $q[0]['payload'], sample_payload(), 'queued payload unchanged (same rid and ts)' );
T::eq( WP_Stub::$autoload[ Rate1_Connector_Options::QUEUE ], false, 'queue stored with autoload off' );
T::eq( wp_next_scheduled( Rate1_Connector_Options::CRON_QUEUE ), $q[0]['next_at'], 'cron event at next_at' );

T::group( 'Retries: up to 3 with the same rid, then dropped' );
foreach ( array( array( 2, 300 ), array( 3, 900 ) ) as $step ) {
	make_due();
	WP_Stub::$responses = array( 503 );
	Rate1_Connector_Sender::process_queue();
	$q = Rate1_Connector_Sender::queue();
	T::eq( array( count( $q ), $q[0]['attempts'] ), array( 1, $step[0] ), "retry failed → attempts {$step[0]}" );
	T::ok( abs( $q[0]['next_at'] - ( time() + $step[1] ) ) <= 1, "next retry after {$step[1]} s" );
}
make_due();
WP_Stub::$responses = array( 503 );
Rate1_Connector_Sender::process_queue();
T::eq( count( Rate1_Connector_Sender::queue() ), 0, 'third retry failed → removed from the queue' );
T::eq( (int) get_option( Rate1_Connector_Options::DROPPED ), 1, 'dropped counter = 1' );
T::eq( count( WP_Stub::$http ), 4, '4 attempts in total (1 + 3 retries)' );
$rids = array_unique(
	array_map(
		function ( $r ) {
			return json_decode( $r['args']['body'], true )['rid'];
		},
		WP_Stub::$http
	)
);
T::eq( count( $rids ), 1, 'every attempt used the same rid' );

T::group( 'Retry succeeds' );
reset_sender();
Rate1_Connector_Sender::enqueue( sample_payload(), 1 );
make_due();
WP_Stub::$responses = array( 0 );
Rate1_Connector_Sender::process_queue();
T::eq( Rate1_Connector_Sender::queue()[0]['attempts'], 2, 'transport error → retried later' );
make_due();
WP_Stub::$responses = array( 200 );
Rate1_Connector_Sender::process_queue();
T::eq( count( Rate1_Connector_Sender::queue() ), 0, '200 (duplicate rid) → done' );
T::eq( (int) get_option( Rate1_Connector_Options::DROPPED ), 0, 'nothing dropped' );

T::group( 'Permanent errors are not retried' );
reset_sender();
Rate1_Connector_Sender::add( sample_payload() );
WP_Stub::$responses = array( 401 );
do_action( 'shutdown' );
T::eq( count( Rate1_Connector_Sender::queue() ), 0, '401 → not queued' );
T::eq( (int) get_option( Rate1_Connector_Options::DROPPED ), 1, 'counted as dropped' );
reset_sender();
Rate1_Connector_Sender::enqueue( sample_payload(), 1 );
make_due();
WP_Stub::$responses = array( 400 );
Rate1_Connector_Sender::process_queue();
T::eq( array( count( Rate1_Connector_Sender::queue() ), (int) get_option( Rate1_Connector_Options::DROPPED ) ), array( 0, 1 ), '400 on retry → dropped' );

T::group( 'Items not yet due stay queued' );
reset_sender();
Rate1_Connector_Sender::enqueue( sample_payload( 'cf7:1:a' ), 1 );
Rate1_Connector_Sender::process_queue();
T::eq( count( WP_Stub::$http ), 0, 'nothing sent before next_at' );
T::eq( count( Rate1_Connector_Sender::queue() ), 1, 'still queued' );

T::group( 'No way to finish the response early → queue + immediate cron' );
reset_sender();
add_filter( 'rate1_connector_finish_request', '__return_false_stub' );
function __return_false_stub() {
	return false;
}
Rate1_Connector_Sender::add( sample_payload() );
do_action( 'shutdown' );
T::eq( count( WP_Stub::$http ), 0, 'no HTTP call during the visitor request' );
$q = Rate1_Connector_Sender::queue();
T::eq( array( count( $q ), $q[0]['attempts'] ), array( 1, 0 ), 'queued with attempts 0' );
T::ok( $q[0]['next_at'] <= time(), 'due now' );
T::ok( false !== wp_next_scheduled( Rate1_Connector_Options::CRON_QUEUE ) && wp_next_scheduled( Rate1_Connector_Options::CRON_QUEUE ) <= time(), 'single cron event scheduled now' );
T::eq( WP_Stub::$spawned, 1, 'spawn_cron() called' );
WP_Stub::$responses = array( 202 );
Rate1_Connector_Sender::process_queue();
T::eq( array( count( WP_Stub::$http ), count( Rate1_Connector_Sender::queue() ) ), array( 1, 0 ), 'cron run sends it' );

T::group( 'Queue cap and scheduling' );
reset_sender();
for ( $i = 0; $i < 205; $i++ ) {
	Rate1_Connector_Sender::enqueue( sample_payload( 'cf7:1:' . $i ), 1 );
}
$q = Rate1_Connector_Sender::queue();
T::eq( count( $q ), 200, 'queue capped at 200' );
T::eq( $q[0]['payload']['rid'], 'cf7:1:5', 'oldest dropped first' );
T::eq( (int) get_option( Rate1_Connector_Options::DROPPED ), 5, 'overflow counted as dropped' );
T::eq( count( WP_Stub::$cron ), 1, 'one cron event for the whole queue' );
make_due();
WP_Stub::$responses = array_fill( 0, 200, 202 );
Rate1_Connector_Sender::process_queue();
T::eq( count( WP_Stub::$http ), 20, 'at most 20 sends per cron run' );
T::eq( count( Rate1_Connector_Sender::queue() ), 180, 'rest stays queued' );
T::ok( wp_next_scheduled( Rate1_Connector_Options::CRON_QUEUE ) <= time(), 'next run scheduled now' );
update_option( Rate1_Connector_Options::QUEUE, array( 'junk', array( 'payload' => 'x' ) ) );
T::eq( Rate1_Connector_Sender::queue(), array(), 'malformed queue items ignored' );
