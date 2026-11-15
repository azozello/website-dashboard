<?php
/**
 * The r1.js script tag (Data contract v1 §3).
 *
 * @package Rate1_Connector
 */

defined( 'ABSPATH' ) || exit;

/**
 * Prints <script defer src="…/v1/r1.js" data-site="pk_…"> in wp_head.
 */
class Rate1_Connector_Tag {

	/** Script handle. WordPress prints it with id="rate1-r1-js". */
	const HANDLE = 'rate1-r1';

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_filter( 'script_loader_tag', array( __CLASS__, 'add_site_attribute' ), 10, 3 );
	}

	/**
	 * URL of r1.js on the collector.
	 *
	 * @return string
	 */
	public static function script_url() {
		return Rate1_Connector_Options::collect_url() . '/v1/r1.js';
	}

	/**
	 * Whether the tag should be printed for this request.
	 *
	 * @return bool
	 */
	public static function should_print() {
		if ( '' === Rate1_Connector_Options::site_key() ) {
			return false;
		}
		if ( Rate1_Connector_Options::exclude_editors() && is_user_logged_in() && current_user_can( 'edit_posts' ) ) {
			return false;
		}
		return true;
	}

	/**
	 * Enqueue r1.js in the head with the defer strategy (WordPress 6.3+).
	 */
	public static function enqueue() {
		if ( ! self::should_print() ) {
			return;
		}
		wp_enqueue_script(
			self::HANDLE,
			self::script_url(),
			array(),
			// The tag must be exactly the contract URL (no ?ver=); the collector versions r1.js itself.
			null, // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion
			array(
				'strategy'  => 'defer',
				'in_footer' => false,
			)
		);
	}

	/**
	 * Add data-site="pk_…" to the r1.js tag.
	 *
	 * @param string $tag    Full HTML for the handle (may include inline scripts).
	 * @param string $handle Script handle.
	 * @param string $src    Script URL.
	 * @return string
	 */
	public static function add_site_attribute( $tag, $handle, $src = '' ) {
		unset( $src );
		if ( self::HANDLE !== $handle || ! is_string( $tag ) || false !== strpos( $tag, 'data-site=' ) ) {
			return $tag;
		}
		$key = Rate1_Connector_Options::site_key();
		if ( '' === $key ) {
			return $tag;
		}
		$attr = ' data-site="' . esc_attr( $key ) . '"';
		$out  = preg_replace( '#<script\b(?=[^>]*\ssrc=["\'][^"\']*/v1/r1\.js)#i', '<script' . $attr, $tag, 1 );
		return is_string( $out ) ? $out : $tag;
	}
}
