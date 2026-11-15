<?php
/**
 * Minimal WordPress stubs + a tiny assertion helper for the plugin unit tests.
 * Plain PHP (7.4+), no dependencies. Run: php wp-plugin/tests/unit/run.php
 */

error_reporting( E_ALL );
ini_set( 'display_errors', '1' );
set_error_handler(
	function ( $no, $str, $file, $line ) {
		throw new ErrorException( $str, 0, $no, $file, $line );
	}
);

define( 'ABSPATH', __DIR__ . '/' );
define( 'DAY_IN_SECONDS', 86400 );
define( 'RATE1_CONNECTOR_VERSION', '0.1.0' );
define( 'RATE1_CONNECTOR_FILE', dirname( __DIR__, 2 ) . '/rate1-connector/rate1-connector.php' );
define( 'RATE1_CONNECTOR_DIR', dirname( __DIR__, 2 ) . '/rate1-connector/' );
define( 'RATE1_CONNECTOR_COLLECT_URL', 'https://collect.bazed.live' );
define( 'CONTRACT_DIR', dirname( __DIR__, 3 ) . '/contract/v1' );

/** Global test state. */
class WP_Stub {
	public static $options   = array();
	public static $autoload  = array();
	public static $filters   = array();
	public static $cron      = array();
	public static $http      = array();
	public static $responses = array();
	public static $referer   = false;
	public static $home      = 'https://site.example';
	public static $logged_in = false;
	public static $caps      = array();
	public static $spawned   = 0;

	public static function reset() {
		self::$options   = array();
		self::$autoload  = array();
		self::$filters   = array();
		self::$cron      = array();
		self::$http      = array();
		self::$responses = array();
		self::$referer   = false;
		self::$home      = 'https://site.example';
		self::$logged_in = false;
		self::$caps      = array();
		self::$spawned   = 0;
		$_POST           = array();
		$_SERVER['HTTP_REFERER'] = null;
	}
}

class WP_Error {
	public $message;
	public function __construct( $code = '', $message = '' ) {
		$this->message = $message;
	}
}

function is_wp_error( $x ) {
	return $x instanceof WP_Error;
}

// ---- hooks ----
function add_filter( $hook, $cb, $prio = 10, $args = 1 ) {
	WP_Stub::$filters[ $hook ][ $prio ][] = array( $cb, $args );
	return true;
}
function add_action( $hook, $cb, $prio = 10, $args = 1 ) {
	return add_filter( $hook, $cb, $prio, $args );
}
function apply_filters( $hook, $value, ...$rest ) {
	if ( empty( WP_Stub::$filters[ $hook ] ) ) {
		return $value;
	}
	ksort( WP_Stub::$filters[ $hook ] );
	foreach ( WP_Stub::$filters[ $hook ] as $cbs ) {
		foreach ( $cbs as $cb ) {
			$value = call_user_func_array( $cb[0], array_slice( array_merge( array( $value ), $rest ), 0, $cb[1] ) );
		}
	}
	return $value;
}
function do_action( $hook, ...$args ) {
	if ( empty( WP_Stub::$filters[ $hook ] ) ) {
		return;
	}
	ksort( WP_Stub::$filters[ $hook ] );
	foreach ( WP_Stub::$filters[ $hook ] as $cbs ) {
		foreach ( $cbs as $cb ) {
			call_user_func_array( $cb[0], array_slice( $args, 0, $cb[1] ) );
		}
	}
}

// ---- options ----
function get_option( $name, $default = false ) {
	return array_key_exists( $name, WP_Stub::$options ) ? WP_Stub::$options[ $name ] : $default;
}
function update_option( $name, $value, $autoload = null ) {
	WP_Stub::$options[ $name ] = $value;
	if ( null !== $autoload ) {
		WP_Stub::$autoload[ $name ] = (bool) $autoload;
	}
	return true;
}
function add_option( $name, $value = '', $deprecated = '', $autoload = null ) {
	if ( array_key_exists( $name, WP_Stub::$options ) ) {
		return false;
	}
	WP_Stub::$options[ $name ]  = $value;
	WP_Stub::$autoload[ $name ] = null === $autoload ? true : (bool) $autoload;
	return true;
}
function delete_option( $name ) {
	unset( WP_Stub::$options[ $name ] );
	return true;
}
function get_site_option( $name, $default = false ) {
	return $default;
}
function is_multisite() {
	return false;
}

// ---- cron ----
function wp_next_scheduled( $hook ) {
	$ts = array();
	foreach ( WP_Stub::$cron as $e ) {
		if ( $e[1] === $hook ) {
			$ts[] = $e[0];
		}
	}
	return $ts ? min( $ts ) : false;
}
function wp_schedule_single_event( $ts, $hook ) {
	WP_Stub::$cron[] = array( $ts, $hook );
	return true;
}
function wp_schedule_event( $ts, $recurrence, $hook ) {
	WP_Stub::$cron[] = array( $ts, $hook );
	return true;
}
function wp_unschedule_event( $ts, $hook ) {
	foreach ( WP_Stub::$cron as $i => $e ) {
		if ( $e[0] === $ts && $e[1] === $hook ) {
			unset( WP_Stub::$cron[ $i ] );
		}
	}
	return true;
}
function wp_clear_scheduled_hook( $hook ) {
	foreach ( WP_Stub::$cron as $i => $e ) {
		if ( $e[1] === $hook ) {
			unset( WP_Stub::$cron[ $i ] );
		}
	}
}
function spawn_cron() {
	WP_Stub::$spawned++;
}

// ---- http ----
function wp_remote_post( $url, $args ) {
	WP_Stub::$http[] = array(
		'url'  => $url,
		'args' => $args,
	);
	$r = array_shift( WP_Stub::$responses );
	if ( null === $r ) {
		$r = 202;
	}
	if ( 0 === $r ) {
		return new WP_Error( 'http_request_failed', 'timeout' );
	}
	return array(
		'response' => array( 'code' => $r ),
		'body'     => '{"ok":true}',
	);
}
function wp_remote_get( $url, $args ) {
	return wp_remote_post( $url, $args );
}
function wp_remote_retrieve_response_code( $r ) {
	return is_array( $r ) ? $r['response']['code'] : '';
}
function wp_remote_retrieve_body( $r ) {
	return is_array( $r ) ? $r['body'] : '';
}

// ---- misc ----
function wp_unslash( $v ) {
	return is_string( $v ) ? stripslashes( $v ) : $v;
}
function sanitize_text_field( $s ) {
	$s = (string) $s;
	$s = strip_tags( $s );
	$s = preg_replace( '/[\r\n\t ]+/', ' ', $s );
	return trim( $s );
}
function wp_strip_all_tags( $s ) {
	return trim( strip_tags( (string) $s ) );
}
function wp_generate_uuid4() {
	$b    = random_bytes( 16 );
	$b[6] = chr( ord( $b[6] ) & 0x0f | 0x40 );
	$b[8] = chr( ord( $b[8] ) & 0x3f | 0x80 );
	return vsprintf( '%s%s-%s-%s-%s-%s%s%s', str_split( bin2hex( $b ), 4 ) );
}
function wp_get_raw_referer() {
	return WP_Stub::$referer;
}
function wp_parse_url( $url, $component = -1 ) {
	return parse_url( $url, $component );
}
function home_url( $path = '' ) {
	return WP_Stub::$home . $path;
}
function untrailingslashit( $s ) {
	return rtrim( $s, '/\\' );
}
function get_bloginfo( $what ) {
	return '7.1';
}
function wp_json_encode( $data, $flags = 0 ) {
	return json_encode( $data, $flags );
}
function wp_list_pluck( $list, $field ) {
	return array_map(
		function ( $i ) use ( $field ) {
			return $i[ $field ];
		},
		$list
	);
}
function esc_attr( $s ) {
	return htmlspecialchars( (string) $s, ENT_QUOTES, 'UTF-8' );
}
function is_user_logged_in() {
	return WP_Stub::$logged_in;
}
function current_user_can( $cap ) {
	return in_array( $cap, WP_Stub::$caps, true );
}

require RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-options.php';
require RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-path.php';
require RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-tag.php';
require RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-sender.php';
require RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-forms.php';
require RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-compat.php';
require RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-hello.php';

// ---- assertions ----
class T {
	public static $pass   = 0;
	public static $fail   = 0;
	public static $group  = '';

	public static function group( $name ) {
		self::$group = $name;
		echo "\n# $name\n";
	}
	public static function ok( $cond, $msg ) {
		if ( $cond ) {
			self::$pass++;
			echo "  ok   $msg\n";
		} else {
			self::$fail++;
			echo "  FAIL $msg\n";
		}
	}
	public static function eq( $actual, $expected, $msg ) {
		$ok = $actual === $expected;
		self::ok( $ok, $msg . ( $ok ? '' : ' — expected ' . var_export( $expected, true ) . ', got ' . var_export( $actual, true ) ) );
	}
}

/** Contract keys of POST /v1/r, in order. */
const R_KEYS = array( 'v', 'rid', 'ts', 'pv', 'path', 'channel', 'source', 'form_id', 'spam', 'spam_reason' );

/**
 * Check a payload against contract/v1/server-request.schema.json by hand
 * (strict key set, types, patterns).
 *
 * @return string[] Problems.
 */
function r_payload_problems( $p ) {
	$e = array();
	if ( ! is_array( $p ) ) {
		return array( 'not an object' );
	}
	$keys = array_keys( $p );
	sort( $keys );
	$want = R_KEYS;
	sort( $want );
	if ( $keys !== $want ) {
		$e[] = 'keys ' . implode( ',', $keys );
	}
	if ( 1 !== ( $p['v'] ?? null ) ) {
		$e[] = 'v';
	}
	if ( ! is_string( $p['rid'] ?? null ) || '' === $p['rid'] || mb_strlen( $p['rid'] ) > 120 ) {
		$e[] = 'rid';
	}
	if ( ! is_int( $p['ts'] ?? null ) || $p['ts'] < 0 ) {
		$e[] = 'ts';
	}
	if ( null !== ( $p['pv'] ?? null ) && ! preg_match( '/^[0-9A-Za-z]{16}$/', (string) $p['pv'] ) ) {
		$e[] = 'pv';
	}
	if ( null !== ( $p['path'] ?? null ) && ( ! is_string( $p['path'] ) || '/' !== $p['path'][0] || mb_strlen( $p['path'] ) > 512 ) ) {
		$e[] = 'path';
	}
	if ( ! in_array( $p['channel'] ?? null, array( 'form', 'booking', 'calculator' ), true ) ) {
		$e[] = 'channel';
	}
	if ( ! in_array( $p['source'] ?? null, array( 'cf7', 'elementor', 'wpforms', 'gravity', 'custom' ), true ) ) {
		$e[] = 'source';
	}
	if ( ! is_string( $p['form_id'] ?? null ) || '' === $p['form_id'] || mb_strlen( $p['form_id'] ) > 100 ) {
		$e[] = 'form_id';
	}
	if ( ! is_bool( $p['spam'] ?? null ) ) {
		$e[] = 'spam';
	}
	if ( ! array_key_exists( 'spam_reason', $p ) || ! in_array( $p['spam_reason'], array( 'honeypot', 'plugin', 'too_fast', null ), true ) ) {
		$e[] = 'spam_reason';
	}
	return $e;
}

/**
 * Optionally validate a payload with the real JSON Schema via the mock
 * collector (set R1_MOCK_URL, e.g. http://127.0.0.1:4010). Returns null when skipped.
 */
function mock_validate( $endpoint, $payload ) {
	$base = getenv( 'R1_MOCK_URL' );
	if ( ! $base ) {
		return null;
	}
	$ctx = stream_context_create(
		array(
			'http' => array(
				'method'        => 'POST',
				'header'        => "Content-Type: application/json\r\nAuthorization: Bearer sk_" . str_repeat( 'A', 40 ) . "\r\n",
				'content'       => json_encode( $payload ),
				'ignore_errors' => true,
				'timeout'       => 3,
			),
		)
	);
	$body = @file_get_contents( rtrim( $base, '/' ) . $endpoint, false, $ctx );
	if ( false === $body ) {
		return null;
	}
	$calls = json_decode( (string) file_get_contents( rtrim( $base, '/' ) . '/_calls?endpoint=' . rawurlencode( $endpoint ) ), true );
	$last  = is_array( $calls ) ? end( $calls ) : null;
	return is_array( $last ) ? $last : null;
}
