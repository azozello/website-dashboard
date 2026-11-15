<?php
/**
 * One-click connect (§8): connect URL, state check, code exchange.
 */

$key    = 'pk_' . str_repeat( 'A', 24 );
$secret = 'sk_' . str_repeat( 'b', 40 );
$code   = str_repeat( 'C', 43 );

/** Simulates the admin's Connect click: keeps the state for that user. */
function rate1_test_click( $user_id, $state ) {
	set_transient( Rate1_Connector_Connect::STATE_PREFIX . $user_id, hash( 'sha256', $state ), Rate1_Connector_Connect::STATE_TTL );
}

T::group( 'Connect: URLs' );
$url = Rate1_Connector_Connect::connect_url( 'state123' );
T::ok( 0 === strpos( $url, 'https://app.bazed.live/connect/wordpress?' ), 'goes to the dashboard connect page' );
parse_str( (string) parse_url( $url, PHP_URL_QUERY ), $q );
T::eq( $q['home_url'], 'https://site.example', 'home_url is the site address' );
T::eq( $q['return_url'], 'https://site.example/wp-admin/admin-post.php?action=rate1_connector_connected', 'return_url is our admin-post action' );
T::eq( $q['state'], 'state123', 'state passed through' );
T::ok( false === strpos( $url, '+' ), 'query encoded per RFC 3986 (no "+")' );
T::eq( Rate1_Connector_Connect::allow_app_host( array( 'site.example' ) ), array( 'site.example', 'app.bazed.live' ), 'dashboard host allowed for wp_safe_redirect' );

T::group( 'Connect: state must come from a Connect click by the same user' );
T::eq( Rate1_Connector_Connect::complete( 1, 'never-clicked', $code, '' ), 'expired', 'no click: expired' );
rate1_test_click( 1, 'right-state' );
T::eq( Rate1_Connector_Connect::complete( 1, 'wrong-state', $code, '' ), 'expired', 'wrong state: expired' );
T::eq( Rate1_Connector_Connect::complete( 1, 'right-state', $code, '' ), 'expired', 'state is cleared after one return' );
rate1_test_click( 1, 'user-1-state' );
T::eq( Rate1_Connector_Connect::complete( 2, 'user-1-state', $code, '' ), 'expired', "another user can't use it" );
T::eq( count( WP_Stub::$http ), 0, 'no request to Rate 1 for any of these' );

T::group( 'Connect: cancel and bad codes' );
rate1_test_click( 1, 's1' );
T::eq( Rate1_Connector_Connect::complete( 1, 's1', '', 'access_denied' ), 'cancelled', 'error from the dashboard: cancelled' );
rate1_test_click( 1, 's2' );
T::eq( Rate1_Connector_Connect::complete( 1, 's2', 'short', '' ), 'failed', 'malformed code: failed' );
T::eq( count( WP_Stub::$http ), 0, 'still no request' );

T::group( 'Connect: exchange' );
rate1_test_click( 1, 's3' );
WP_Stub::$responses = array( array( 400, '{"error":"invalid_code"}' ) );
T::eq( Rate1_Connector_Connect::complete( 1, 's3', $code, '' ), 'failed', 'code refused: failed' );
T::eq( get_option( Rate1_Connector_Options::SITE_SECRET, '' ), '', 'nothing stored' );

rate1_test_click( 1, 's4' );
WP_Stub::$responses = array( array( 200, '{"site_key":"nope","site_secret":"' . $secret . '"}' ) );
T::eq( Rate1_Connector_Connect::complete( 1, 's4', $code, '' ), 'bad_response', 'invalid key in answer: bad_response' );
T::eq( get_option( Rate1_Connector_Options::SITE_KEY, '' ), '', 'nothing stored' );

WP_Stub::$http = array();
rate1_test_click( 1, 's5' );
WP_Stub::$responses = array( array( 200, wp_json_encode( array( 'site_key' => $key, 'site_secret' => $secret ) ) ) );
T::eq( Rate1_Connector_Connect::complete( 1, 's5', $code, '' ), 'ok', 'valid code: ok' );
$exchange = WP_Stub::$http[0];
T::eq( $exchange['url'], 'https://app.bazed.live/api/connect/exchange', 'exchange called on the dashboard host' );
T::eq( json_decode( $exchange['args']['body'], true ), array( 'code' => $code ), 'exchange body is just the code' );
T::eq( $exchange['args']['headers']['Content-Type'], 'application/json', 'sent as JSON' );
T::eq( Rate1_Connector_Options::site_key(), $key, 'site key stored' );
T::eq( Rate1_Connector_Options::site_secret(), $secret, 'site secret stored' );
T::eq( WP_Stub::$autoload[ Rate1_Connector_Options::SITE_SECRET ] ?? null, false, 'secret stored with autoload off' );
T::eq( count( WP_Stub::$http ), 1, 'one request: the exchange (the hello follows in finish())' );
