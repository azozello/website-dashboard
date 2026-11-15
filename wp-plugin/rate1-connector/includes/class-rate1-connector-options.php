<?php
/**
 * Option names, cron hooks and accessors.
 *
 * @package Rate1_Connector
 */

defined( 'ABSPATH' ) || exit;

/**
 * Central place for every option and cron hook the plugin owns.
 *
 * Every option starts with "rate1_connector_" so uninstall.php can remove them all.
 */
class Rate1_Connector_Options {

	/** Public site key (pk_…), autoloaded because the tag needs it on every page. */
	const SITE_KEY = 'rate1_connector_site_key';

	/** Site secret (sk_…), autoload off, never printed into HTML. */
	const SITE_SECRET = 'rate1_connector_site_secret';

	/** "1" (default) skips the tag for logged-in users who can edit posts. */
	const EXCLUDE_EDITORS = 'rate1_connector_exclude_editors';

	/** Retry queue for POST /v1/r: list of { payload, attempts, next_at }. Autoload off. */
	const QUEUE = 'rate1_connector_queue';

	/** Number of /v1/r payloads given up on (retries exhausted, permanent error or queue overflow). */
	const DROPPED = 'rate1_connector_dropped';

	/** Result of the last hello. */
	const LAST_HELLO = 'rate1_connector_last_hello';

	/** HTTP status and time of the last POST /v1/r attempt. */
	const LAST_SEND = 'rate1_connector_last_send';

	/** WP-Cron hook that processes due queue items. */
	const CRON_QUEUE = 'rate1_connector_process_queue';

	/** WP-Cron hook for the hello (daily, plus one-off runs). */
	const CRON_HELLO = 'rate1_connector_hello';

	/**
	 * All option names, used by uninstall.php.
	 *
	 * @return string[]
	 */
	public static function all() {
		return array(
			self::SITE_KEY,
			self::SITE_SECRET,
			self::EXCLUDE_EDITORS,
			self::QUEUE,
			self::DROPPED,
			self::LAST_HELLO,
			self::LAST_SEND,
		);
	}

	/**
	 * All cron hooks, used on deactivation and by uninstall.php.
	 *
	 * @return string[]
	 */
	public static function cron_hooks() {
		return array( self::CRON_QUEUE, self::CRON_HELLO );
	}

	/**
	 * Whether a string is a valid site key (contract §1: "pk_" + 24 base62).
	 *
	 * @param mixed $key Candidate.
	 * @return bool
	 */
	public static function is_valid_key( $key ) {
		return is_string( $key ) && 1 === preg_match( '/^pk_[0-9A-Za-z]{24}$/', $key );
	}

	/**
	 * Whether a string is a valid site secret (contract §1: "sk_" + 40 base62).
	 *
	 * @param mixed $secret Candidate.
	 * @return bool
	 */
	public static function is_valid_secret( $secret ) {
		return is_string( $secret ) && 1 === preg_match( '/^sk_[0-9A-Za-z]{40}$/', $secret );
	}

	/**
	 * The stored site key, or '' if none or invalid.
	 *
	 * @return string
	 */
	public static function site_key() {
		$key = get_option( self::SITE_KEY, '' );
		return self::is_valid_key( $key ) ? $key : '';
	}

	/**
	 * The stored site secret, or '' if none or invalid. Never print this.
	 *
	 * @return string
	 */
	public static function site_secret() {
		$secret = get_option( self::SITE_SECRET, '' );
		return self::is_valid_secret( $secret ) ? $secret : '';
	}

	/**
	 * Whether internal traffic (users who can edit posts) is excluded from tracking.
	 *
	 * @return bool
	 */
	public static function exclude_editors() {
		return '0' !== (string) get_option( self::EXCLUDE_EDITORS, '1' );
	}

	/**
	 * The collector base URL without a trailing slash.
	 *
	 * @return string
	 */
	public static function collect_url() {
		return untrailingslashit( RATE1_CONNECTOR_COLLECT_URL );
	}

	/**
	 * User agent for server-to-server calls. Identifies the plugin, never a visitor.
	 *
	 * @return string
	 */
	public static function user_agent() {
		return 'Rate1Connector/' . RATE1_CONNECTOR_VERSION . '; WordPress/' . get_bloginfo( 'version' );
	}
}
