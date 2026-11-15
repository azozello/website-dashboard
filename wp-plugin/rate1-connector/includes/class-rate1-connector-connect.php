<?php
/**
 * One-click connect (Data contract v1 §8).
 *
 * @package Rate1_Connector
 */

defined( 'ABSPATH' ) || exit;

/**
 * "Connect to Rate 1" on the settings page.
 *
 * 1. start(): the admin clicks Connect (nonce-checked POST). A random state is kept for this user for 10 minutes,
 *    and the browser goes to <app>/connect/wordpress?home_url=…&return_url=…&state=… where the admin signs in
 *    and picks the website.
 * 2. finish(): the dashboard sends the browser back to admin-post.php with code and state (or error). The state
 *    must match the one kept for this user; then the code is exchanged server to server at
 *    <app>/api/connect/exchange for the site key and secret, which are stored like the manual fields.
 *
 * The code is single-use and valid for 5 minutes on the Rate 1 side; the state can be used once here.
 */
class Rate1_Connector_Connect {

	/** Action of the Connect button (admin-post.php, also the nonce action). */
	const START = 'rate1_connector_connect';

	/** Nonce field of the Connect form (not "_wpnonce": the settings form on the same page has that one). */
	const NONCE_FIELD = 'rate1_connect_nonce';

	/** Action the dashboard returns to (admin-post.php). */
	const FINISH = 'rate1_connector_connected';

	/** Transient prefix for the per-user state; the user id is appended. */
	const STATE_PREFIX = 'rate1_connector_connect_state_';

	/** How long a Connect click stays valid, in seconds. */
	const STATE_TTL = 600;

	/**
	 * Register hooks. Admin only.
	 */
	public static function init() {
		add_action( 'admin_post_' . self::START, array( __CLASS__, 'start' ) );
		add_action( 'admin_post_' . self::FINISH, array( __CLASS__, 'finish' ) );
		add_filter( 'allowed_redirect_hosts', array( __CLASS__, 'allow_app_host' ) );
	}

	/**
	 * Base URL of the Rate 1 dashboard without a trailing slash.
	 *
	 * @return string
	 */
	public static function app_url() {
		return untrailingslashit( RATE1_CONNECTOR_APP_URL );
	}

	/**
	 * Let wp_safe_redirect() send the admin to the Rate 1 dashboard.
	 *
	 * @param string[] $hosts Allowed hosts.
	 * @return string[]
	 */
	public static function allow_app_host( $hosts ) {
		$host = wp_parse_url( self::app_url(), PHP_URL_HOST );
		if ( $host ) {
			$hosts[] = $host;
		}
		return $hosts;
	}

	/**
	 * Where the dashboard sends the admin back to.
	 *
	 * @return string
	 */
	public static function return_url() {
		return admin_url( 'admin-post.php?action=' . self::FINISH );
	}

	/**
	 * The dashboard's connect page for this site.
	 *
	 * @param string $state Random one-time value.
	 * @return string
	 */
	public static function connect_url( $state ) {
		return self::app_url() . '/connect/wordpress?' . http_build_query(
			array(
				'home_url'   => home_url(),
				'return_url' => self::return_url(),
				'state'      => $state,
			),
			'',
			'&',
			PHP_QUERY_RFC3986
		);
	}

	/**
	 * Connect button: remember a state for this user, then go to the Rate 1 dashboard.
	 */
	public static function start() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to change these settings.', 'rate1-connector' ), 403 );
		}
		check_admin_referer( self::START, self::NONCE_FIELD );

		$state = wp_generate_password( 32, false );
		set_transient( self::STATE_PREFIX . get_current_user_id(), hash( 'sha256', $state ), self::STATE_TTL );

		wp_safe_redirect( self::connect_url( $state ) );
		exit;
	}

	/**
	 * Return from the Rate 1 dashboard: finish, then show the outcome on the settings page.
	 */
	public static function finish() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to change these settings.', 'rate1-connector' ), 403 );
		}
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- A redirect back from the Rate 1 dashboard can't carry a nonce; the one-time state kept for this user (checked in complete()) protects it instead.
		$state = isset( $_GET['state'] ) ? sanitize_text_field( wp_unslash( $_GET['state'] ) ) : '';
		$code  = isset( $_GET['code'] ) ? sanitize_text_field( wp_unslash( $_GET['code'] ) ) : '';
		$error = isset( $_GET['error'] ) ? sanitize_text_field( wp_unslash( $_GET['error'] ) ) : '';
		// phpcs:enable WordPress.Security.NonceVerification.Recommended

		$result = self::complete( get_current_user_id(), $state, $code, $error );
		if ( 'ok' === $result ) {
			Rate1_Connector_Hello::send( 'connect' ); // Same as after saving the settings: confirms the new secret.
		}
		wp_safe_redirect( add_query_arg( 'rate1_connect', $result, Rate1_Connector_Admin::page_url() ) );
		exit;
	}

	/**
	 * Check the state, exchange the code and store the keys.
	 *
	 * @param int    $user_id Current user.
	 * @param string $state   State from the return URL.
	 * @param string $code    One-time code from the return URL.
	 * @param string $error   Error from the return URL (the admin cancelled).
	 * @return string ok, cancelled, expired (no matching Connect click), failed or bad_response.
	 */
	public static function complete( $user_id, $state, $code, $error ) {
		$transient = self::STATE_PREFIX . (int) $user_id;
		$expected  = get_transient( $transient );
		delete_transient( $transient ); // One return per Connect click.

		if ( ! is_string( $expected ) || '' === $state || ! hash_equals( $expected, hash( 'sha256', $state ) ) ) {
			return 'expired';
		}
		if ( '' !== $error ) {
			return 'cancelled';
		}
		if ( 1 !== preg_match( '/^[A-Za-z0-9_-]{20,100}$/', $code ) ) {
			return 'failed';
		}

		$response = wp_remote_post(
			self::app_url() . '/api/connect/exchange',
			array(
				'timeout' => 15,
				'headers' => array(
					'Content-Type' => 'application/json',
					'User-Agent'   => Rate1_Connector_Options::user_agent(),
				),
				'body'    => wp_json_encode( array( 'code' => $code ) ),
			)
		);
		if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
			return 'failed';
		}

		$data   = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		$key    = is_array( $data ) && isset( $data['site_key'] ) ? $data['site_key'] : '';
		$secret = is_array( $data ) && isset( $data['site_secret'] ) ? $data['site_secret'] : '';
		if ( ! Rate1_Connector_Options::is_valid_key( $key ) || ! Rate1_Connector_Options::is_valid_secret( $secret ) ) {
			return 'bad_response';
		}

		update_option( Rate1_Connector_Options::SITE_KEY, $key );
		update_option( Rate1_Connector_Options::SITE_SECRET, $secret, false );
		return 'ok';
	}
}
