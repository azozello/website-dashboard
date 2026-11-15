<?php
/**
 * Non-blocking sender and retry queue for POST /v1/r (Data contract v1 §6).
 *
 * @package Rate1_Connector
 */

defined( 'ABSPATH' ) || exit;

/**
 * Collects payloads during the request and sends them after the visitor's
 * response is finished. Failures go to a WP-Cron retry queue (same rid).
 */
class Rate1_Connector_Sender {

	/** HTTP timeout for POST /v1/r, seconds. */
	const TIMEOUT = 3;

	/** Delay before retry 1, 2 and 3, seconds. The array length is the retry limit. */
	const RETRY_DELAYS = array( 60, 300, 900 );

	/** Maximum queued items; the oldest are dropped beyond this. */
	const MAX_QUEUE = 200;

	/** Maximum items sent per cron run. */
	const BATCH = 20;

	/**
	 * Payloads waiting for the end of this request, keyed by rid.
	 *
	 * @var array<string, array>
	 */
	private static $pending = array();

	/**
	 * Whether the shutdown flush is hooked.
	 *
	 * @var bool
	 */
	private static $hooked = false;

	/**
	 * Register the cron handler.
	 */
	public static function init() {
		add_action( Rate1_Connector_Options::CRON_QUEUE, array( __CLASS__, 'process_queue' ) );
	}

	/**
	 * Queue a payload for sending at the end of this request. A second payload
	 * with the same rid in the same request is ignored.
	 *
	 * @param array $payload Body for POST /v1/r.
	 */
	public static function add( array $payload ) {
		$rid = isset( $payload['rid'] ) ? (string) $payload['rid'] : '';
		if ( '' === $rid || isset( self::$pending[ $rid ] ) ) {
			return;
		}
		self::$pending[ $rid ] = $payload;
		if ( ! self::$hooked ) {
			self::$hooked = true;
			add_action( 'shutdown', array( __CLASS__, 'flush' ), PHP_INT_MAX - 10 );
		}
	}

	/**
	 * Payloads collected so far in this request (for tests and diagnostics).
	 *
	 * @return array[]
	 */
	public static function pending() {
		return array_values( self::$pending );
	}

	/**
	 * Shutdown: finish the visitor's response, then send. Without a way to
	 * finish the response early, never block: queue and let WP-Cron send.
	 */
	public static function flush() {
		if ( empty( self::$pending ) ) {
			return;
		}
		$payloads      = array_values( self::$pending );
		self::$pending = array();

		if ( self::finish_request() ) {
			foreach ( $payloads as $payload ) {
				$result = self::send( $payload );
				if ( 'retry' === $result ) {
					self::enqueue( $payload, 1 );
				} elseif ( 'permanent' === $result ) {
					self::count_dropped();
				}
			}
			return;
		}

		foreach ( $payloads as $payload ) {
			self::enqueue( $payload, 0, time() );
		}
		self::kick_cron();
	}

	/**
	 * Flush the response to the visitor so the HTTP call below can't slow it down.
	 *
	 * @return bool True when the response was finished (or could be).
	 */
	private static function finish_request() {
		/**
		 * Filters whether the plugin may end the visitor's response early
		 * (fastcgi_finish_request / litespeed_finish_request) before sending.
		 * Return false to always use the WP-Cron queue instead.
		 *
		 * @param bool $allowed Default true.
		 */
		if ( ! apply_filters( 'rate1_connector_finish_request', true ) ) {
			return false;
		}
		if ( function_exists( 'fastcgi_finish_request' ) ) {
			fastcgi_finish_request();
			return true;
		}
		if ( function_exists( 'litespeed_finish_request' ) ) {
			litespeed_finish_request();
			return true;
		}
		return false;
	}

	/**
	 * Trigger WP-Cron now (non-blocking loopback), unless the site runs a real cron.
	 */
	private static function kick_cron() {
		if ( defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ) {
			return;
		}
		spawn_cron();
	}

	/**
	 * POST one payload. Logs nothing about its contents.
	 *
	 * @param array $payload Body for POST /v1/r.
	 * @return string 'ok', 'retry' or 'permanent'.
	 */
	public static function send( array $payload ) {
		$secret = Rate1_Connector_Options::site_secret();
		if ( '' === $secret ) {
			return 'permanent';
		}
		$response = wp_remote_post(
			Rate1_Connector_Options::collect_url() . '/v1/r',
			array(
				'timeout'     => self::TIMEOUT,
				'redirection' => 0,
				'user-agent'  => Rate1_Connector_Options::user_agent(),
				'headers'     => array(
					'Authorization' => 'Bearer ' . $secret,
					'Content-Type'  => 'application/json',
				),
				'body'        => wp_json_encode( $payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ),
			)
		);
		$code     = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
		update_option(
			Rate1_Connector_Options::LAST_SEND,
			array(
				'at'   => time(),
				'code' => $code,
			),
			false
		);
		return self::classify( $code );
	}

	/**
	 * Map an HTTP status to an outcome. 0 = transport error.
	 * 200 (duplicate rid) and 202 are success; 408, 429, 3xx and 5xx are retried;
	 * other 4xx (400 invalid, 401 bad secret, …) are permanent.
	 *
	 * @param int $code HTTP status.
	 * @return string
	 */
	public static function classify( $code ) {
		if ( 200 === $code || 202 === $code ) {
			return 'ok';
		}
		if ( $code >= 400 && $code < 500 && 408 !== $code && 429 !== $code ) {
			return 'permanent';
		}
		return 'retry';
	}

	/**
	 * Add a payload to the retry queue.
	 *
	 * @param array    $payload  Body for POST /v1/r (rid unchanged).
	 * @param int      $attempts Attempts already made.
	 * @param int|null $next_at  Unix time of the next attempt; default from RETRY_DELAYS.
	 */
	public static function enqueue( array $payload, $attempts, $next_at = null ) {
		$attempts = (int) $attempts;
		if ( null === $next_at ) {
			$next_at = time() + self::delay_after( $attempts );
		}
		$queue   = self::queue();
		$queue[] = array(
			'payload'  => $payload,
			'attempts' => $attempts,
			'next_at'  => (int) $next_at,
		);
		self::save_queue( $queue );
	}

	/**
	 * Seconds to wait after the given number of failed attempts.
	 *
	 * @param int $attempts Attempts made (>= 1).
	 * @return int
	 */
	private static function delay_after( $attempts ) {
		$i = max( 0, min( count( self::RETRY_DELAYS ) - 1, $attempts - 1 ) );
		return $attempts < 1 ? 0 : self::RETRY_DELAYS[ $i ];
	}

	/**
	 * WP-Cron: send due items; reschedule failures (up to 3 retries), drop the rest.
	 */
	public static function process_queue() {
		$now   = time();
		$due   = array();
		$keep  = array();
		$queue = self::queue();
		foreach ( $queue as $item ) {
			if ( count( $due ) < self::BATCH && $item['next_at'] <= $now ) {
				$due[] = $item;
			} else {
				$keep[] = $item;
			}
		}
		if ( empty( $due ) ) {
			self::schedule_next( $queue );
			return;
		}
		// Take the due items out first so a parallel run can't send them twice.
		self::save_queue( $keep, false );

		$failed = array();
		foreach ( $due as $item ) {
			$result   = self::send( $item['payload'] );
			$attempts = $item['attempts'] + 1;
			if ( 'ok' === $result ) {
				continue;
			}
			if ( 'retry' === $result && $attempts <= count( self::RETRY_DELAYS ) ) {
				$failed[] = array(
					'payload'  => $item['payload'],
					'attempts' => $attempts,
					'next_at'  => time() + self::delay_after( $attempts ),
				);
			} else {
				self::count_dropped();
			}
		}
		self::save_queue( array_merge( self::queue(), $failed ) );
	}

	/**
	 * The queue, with malformed items removed.
	 *
	 * @return array[]
	 */
	public static function queue() {
		$queue = get_option( Rate1_Connector_Options::QUEUE, array() );
		if ( ! is_array( $queue ) ) {
			return array();
		}
		$out = array();
		foreach ( $queue as $item ) {
			if ( is_array( $item ) && isset( $item['payload'], $item['attempts'], $item['next_at'] ) && is_array( $item['payload'] ) ) {
				$out[] = array(
					'payload'  => $item['payload'],
					'attempts' => (int) $item['attempts'],
					'next_at'  => (int) $item['next_at'],
				);
			}
		}
		return $out;
	}

	/**
	 * Save the queue (autoload off), cap its size and schedule the next run.
	 *
	 * @param array[] $queue    Items.
	 * @param bool    $schedule Whether to (re)schedule the cron event.
	 */
	private static function save_queue( array $queue, $schedule = true ) {
		$overflow = count( $queue ) - self::MAX_QUEUE;
		if ( $overflow > 0 ) {
			$queue = array_slice( $queue, $overflow );
			self::count_dropped( $overflow );
		}
		update_option( Rate1_Connector_Options::QUEUE, array_values( $queue ), false );
		if ( $schedule ) {
			self::schedule_next( $queue );
		}
	}

	/**
	 * Make sure a single cron event exists at (or before) the earliest next_at.
	 *
	 * @param array[] $queue Items.
	 */
	public static function schedule_next( array $queue ) {
		if ( empty( $queue ) ) {
			return;
		}
		$at = min( wp_list_pluck( $queue, 'next_at' ) );
		$at = max( (int) $at, time() );

		$next = wp_next_scheduled( Rate1_Connector_Options::CRON_QUEUE );
		if ( false !== $next && $next <= $at ) {
			return;
		}
		if ( false !== $next ) {
			wp_unschedule_event( $next, Rate1_Connector_Options::CRON_QUEUE );
		}
		wp_schedule_single_event( $at, Rate1_Connector_Options::CRON_QUEUE );
	}

	/**
	 * Increase the dropped counter.
	 *
	 * @param int $n How many were dropped.
	 */
	private static function count_dropped( $n = 1 ) {
		update_option( Rate1_Connector_Options::DROPPED, (int) get_option( Rate1_Connector_Options::DROPPED, 0 ) + (int) $n, false );
	}
}
