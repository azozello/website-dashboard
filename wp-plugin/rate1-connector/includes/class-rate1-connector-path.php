<?php
/**
 * Path normalisation (Data contract v1 §1).
 *
 * @package Rate1_Connector
 */

defined( 'ABSPATH' ) || exit;

/**
 * Same rule as r1.js and ingest; test vectors in contract/v1/path-normalisation.json.
 */
class Rate1_Connector_Path {

	/** Maximum path length in characters. */
	const MAX = 512;

	/**
	 * Normalise a URL or path: take the pathname (drop scheme, host, query and
	 * fragment); percent-decode, but keep it undecoded if any escape is malformed
	 * or the result is not valid UTF-8; strip trailing slashes except for "/";
	 * keep case; prepend "/" if missing; at most 512 characters.
	 *
	 * @param string $input URL or path.
	 * @return string
	 */
	public static function normalise( $input ) {
		$p = is_string( $input ) ? $input : '';
		$p = (string) preg_replace( '~^[a-z][a-z\d+.\-]*://[^/?#]*~i', '', $p );
		$p = (string) preg_split( '/[?#]/', $p, 2 )[0];
		if ( ! preg_match( '/%(?![0-9a-f]{2})/i', $p ) ) {
			$decoded = rawurldecode( $p );
			if ( self::is_utf8( $decoded ) ) {
				$p = $decoded;
			}
		}
		$p = rtrim( $p, '/' );
		if ( '' === $p || '/' !== $p[0] ) {
			$p = '/' . $p;
		}
		return self::truncate( $p, self::MAX );
	}

	/**
	 * Validate an already-normalised path from the r1_path hidden field.
	 *
	 * Not re-normalised (decoding twice is not idempotent); only checked:
	 * must start with "/", be valid UTF-8, no control characters, max 512.
	 *
	 * @param mixed $raw Unslashed field value.
	 * @return string|null Null when unusable.
	 */
	public static function clean_field( $raw ) {
		if ( ! is_string( $raw ) || '' === $raw || '/' !== $raw[0] || ! self::is_utf8( $raw ) ) {
			return null;
		}
		$path = (string) preg_replace( '/[\x00-\x1F\x7F]/', '', $raw );
		return self::truncate( $path, self::MAX );
	}

	/**
	 * Normalised path of the HTTP Referer, only when it points at this site.
	 *
	 * @return string|null
	 */
	public static function from_referer() {
		$referer = wp_get_raw_referer();
		if ( ! is_string( $referer ) || '' === $referer ) {
			return null;
		}
		$ref_host = wp_parse_url( $referer, PHP_URL_HOST );
		if ( is_string( $ref_host ) && '' !== $ref_host ) {
			$home_host = wp_parse_url( home_url(), PHP_URL_HOST );
			if ( ! is_string( $home_host ) || self::bare_host( $ref_host ) !== self::bare_host( $home_host ) ) {
				return null;
			}
		} elseif ( '/' !== $referer[0] ) {
			return null;
		}
		return self::normalise( $referer );
	}

	/**
	 * Lowercase host without a leading "www.".
	 *
	 * @param string $host Host name.
	 * @return string
	 */
	private static function bare_host( $host ) {
		$host = strtolower( $host );
		return 0 === strpos( $host, 'www.' ) ? substr( $host, 4 ) : $host;
	}

	/**
	 * Whether a string is valid UTF-8.
	 *
	 * @param string $s String.
	 * @return bool
	 */
	private static function is_utf8( $s ) {
		return 1 === preg_match( '//u', $s );
	}

	/**
	 * Truncate to a number of characters (code points), UTF-8 safe.
	 *
	 * @param string $s   String.
	 * @param int    $max Maximum characters.
	 * @return string
	 */
	public static function truncate( $s, $max ) {
		if ( strlen( $s ) <= $max ) {
			return $s;
		}
		if ( preg_match( '/^.{0,' . (int) $max . '}/us', $s, $m ) ) {
			return $m[0];
		}
		return substr( $s, 0, $max );
	}
}
