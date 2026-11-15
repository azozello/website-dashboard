<?php
/**
 * Hello — POST /v1/plugin/hello (Data contract v1 §8).
 *
 * @package Rate1_Connector
 */

defined( 'ABSPATH' ) || exit;

/**
 * Reports the plugin's environment: on activation, on settings save and daily.
 */
class Rate1_Connector_Hello {

	/** HTTP timeout for the hello, seconds. */
	const TIMEOUT = 5;

	/** HTTP timeout for fetching the homepage, seconds. */
	const HOME_TIMEOUT = 10;

	/**
	 * Register the cron handler.
	 */
	public static function init() {
		add_action( Rate1_Connector_Options::CRON_HELLO, array( __CLASS__, 'cron' ) );
	}

	/**
	 * WP-Cron handler.
	 */
	public static function cron() {
		self::send( 'daily' );
	}

	/**
	 * Build the hello body.
	 *
	 * @return array
	 */
	public static function build() {
		$head = self::check_head_hook();
		return array(
			'v'               => 1,
			'platform'        => 'wordpress',
			'plugin_version'  => RATE1_CONNECTOR_VERSION,
			'wp_version'      => (string) get_bloginfo( 'version' ),
			'php_version'     => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION,
			'home_url'        => home_url(),
			'theme'           => (string) get_stylesheet(),
			'head_hook_ok'    => $head['ok'],
			'head_hook_error' => $head['error'],
			'forms'           => Rate1_Connector_Forms::list_forms(),
			'cache'           => Rate1_Connector_Compat::cache_report(),
			'consent'         => Rate1_Connector_Compat::consent_report(),
		);
	}

	/**
	 * Build and send the hello; store the outcome for the settings page.
	 *
	 * @param string $trigger activation, settings or daily.
	 * @return array The stored outcome.
	 */
	public static function send( $trigger ) {
		$secret = Rate1_Connector_Options::site_secret();
		if ( '' === $secret ) {
			return self::store(
				array(
					'trigger' => $trigger,
					'sent'    => false,
					'ok'      => false,
					'code'    => 0,
					'error'   => 'no_secret',
				)
			);
		}

		$body     = self::build();
		$response = wp_remote_post(
			Rate1_Connector_Options::collect_url() . '/v1/plugin/hello',
			array(
				'timeout'     => self::TIMEOUT,
				'redirection' => 0,
				'user-agent'  => Rate1_Connector_Options::user_agent(),
				'headers'     => array(
					'Authorization' => 'Bearer ' . $secret,
					'Content-Type'  => 'application/json',
				),
				'body'        => wp_json_encode( $body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ),
			)
		);

		$code  = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
		$reply = $code ? json_decode( (string) wp_remote_retrieve_body( $response ), true ) : null;
		$ok    = 200 === $code && is_array( $reply ) && ! empty( $reply['ok'] );

		return self::store(
			array(
				'trigger'         => $trigger,
				'sent'            => true,
				'ok'              => $ok,
				'code'            => $code,
				'error'           => $ok ? null : ( is_wp_error( $response ) ? 'request_failed' : 'http_' . $code ),
				'head_hook_ok'    => $body['head_hook_ok'],
				'head_hook_error' => $body['head_hook_error'],
				'forms'           => count( $body['forms'] ),
				'config_version'  => is_array( $reply ) && isset( $reply['config_version'] ) ? (int) $reply['config_version'] : null,
			)
		);
	}

	/**
	 * Store the last hello outcome (autoload off).
	 *
	 * @param array $result Outcome.
	 * @return array
	 */
	private static function store( array $result ) {
		$result['at'] = time();
		update_option( Rate1_Connector_Options::LAST_HELLO, $result, false );
		return $result;
	}

	/**
	 * Fetch the homepage on the server (no cookies, like a first-time visitor)
	 * and confirm the r1.js tag with this site's key is in it.
	 *
	 * @return array { ok: bool, error: string|null }
	 */
	public static function check_head_hook() {
		$key = Rate1_Connector_Options::site_key();
		if ( '' === $key ) {
			return array(
				'ok'    => false,
				'error' => 'no_site_key',
			);
		}
		$response = wp_remote_get(
			home_url( '/' ),
			array(
				'timeout'     => self::HOME_TIMEOUT,
				'redirection' => 3,
				'cookies'     => array(),
				'user-agent'  => Rate1_Connector_Options::user_agent(),
				/** This filter is documented in wp-includes/class-wp-http-streams.php */
				'sslverify'   => apply_filters( 'https_local_ssl_verify', false ), // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Core filter for loopback requests.
			)
		);
		if ( is_wp_error( $response ) ) {
			return array(
				'ok'    => false,
				'error' => 'request_failed',
			);
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( 200 !== $code ) {
			return array(
				'ok'    => false,
				'error' => 'http_' . $code,
			);
		}
		return self::html_has_tag( (string) wp_remote_retrieve_body( $response ), $key )
			? array(
				'ok'    => true,
				'error' => null,
			)
			: array(
				'ok'    => false,
				'error' => 'tag_missing',
			);
	}

	/**
	 * Whether HTML contains a script tag that loads /v1/r1.js with data-site="<key>".
	 *
	 * @param string $html HTML.
	 * @param string $key  Site key.
	 * @return bool
	 */
	public static function html_has_tag( $html, $key ) {
		if ( ! preg_match_all( '#<script\b[^>]*>#i', $html, $m ) ) {
			return false;
		}
		foreach ( $m[0] as $tag ) {
			if ( false !== strpos( $tag, '/v1/r1.js' ) && preg_match( '#\bdata-site\s*=\s*["\']?' . preg_quote( $key, '#' ) . '["\'\s>]#', $tag ) ) {
				return true;
			}
		}
		return false;
	}
}
