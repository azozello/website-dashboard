<?php
/**
 * Form hooks with stubbed form plugin objects: Elementor Pro (no licence
 * available, so this is its only test), CF7 handler logic, WPForms, Gravity Forms.
 */

const SECRET = 'sk_0123456789abcdefghijABCDEFGHIJ0123456789';
const PV     = 'Qm7Xk2Lp9Rt4Vb8N';
const UUID   = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

/** Stub of ElementorPro\Modules\Forms\Classes\Form_Record. */
class Stub_Elementor_Record {
	private $settings;
	private $fields;
	public function __construct( $settings, $fields ) {
		$this->settings = $settings;
		$this->fields   = $fields;
	}
	public function get_form_settings( $key ) {
		return isset( $this->settings[ $key ] ) ? $this->settings[ $key ] : false;
	}
	public function get( $key ) {
		return 'fields' === $key ? $this->fields : null;
	}
}

/** Stub of WPCF7_ContactForm. */
class Stub_CF7_Form {
	public function id() {
		return 12;
	}
}

/** Stub of WPCF7_Submission (only what the plugin calls). */
class WPCF7_Submission {
	public static $log = array();
	public static function get_instance() {
		return new self();
	}
	public function get_spam_log() {
		return self::$log;
	}
}

/**
 * Reset the per-request state and return the visitor's POST.
 */
function fresh_request( array $post ) {
	Rate1_Connector_Forms::reset();
	$r = new ReflectionProperty( 'Rate1_Connector_Sender', 'pending' );
	$r->setAccessible( true );
	$r->setValue( null, array() );
	$_POST = $post;
}

/**
 * Whether any sensitive value appears anywhere in the payloads.
 */
function leaks( array $payloads, array $values ) {
	$json = json_encode( $payloads, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
	foreach ( $values as $v ) {
		if ( false !== stripos( $json, $v ) ) {
			return $v;
		}
	}
	return false;
}

$visitor = array(
	'r1_pv'       => PV,
	'r1_path'     => '/back-pain',
	'form_fields' => array(
		'name'    => 'Jane Secretname',
		'email'   => 'jane.secret@example.test',
		'phone'   => '+49 170 5550123',
		'message' => 'my private message',
	),
	'your-name'   => 'Jane Secretname',
	'your-email'  => 'jane.secret@example.test',
);
$secrets = array( 'Secretname', 'jane.secret', '5550123', 'private message' );

// ------------------------------------------------------------------
T::group( 'Elementor Pro: elementor_pro/forms/new_record with a stubbed record' );
update_option( Rate1_Connector_Options::SITE_SECRET, SECRET );
Rate1_Connector_Forms::init();
fresh_request( $visitor );
$record = new Stub_Elementor_Record(
	array(
		'id'        => 'a1b2c3',
		'form_name' => 'Quick enquiry',
		'form_id'   => 'custom-id',
	),
	$visitor['form_fields']
);
do_action( 'elementor_pro/forms/new_record', $record, new stdClass() );
$p = Rate1_Connector_Sender::pending();
T::eq( count( $p ), 1, 'one payload queued for this request' );
T::eq( r_payload_problems( $p[0] ), array(), 'payload matches the §6 schema (strict keys, types, patterns)' );
T::eq( $p[0]['source'], 'elementor', 'source = elementor' );
T::eq( $p[0]['form_id'], 'a1b2c3', 'form_id = form element id (get_form_settings("id"))' );
T::eq( $p[0]['pv'], PV, 'pv from r1_pv' );
T::eq( $p[0]['path'], '/back-pain', 'path from r1_path' );
T::eq( $p[0]['channel'], 'form', 'channel = form' );
T::eq( $p[0]['spam'], false, 'spam = false (Elementor rejects spam before new_record)' );
T::eq( $p[0]['spam_reason'], null, 'spam_reason = null' );
T::ok( 1 === preg_match( '/^elementor:a1b2c3:' . UUID . '$/', $p[0]['rid'] ), 'rid = elementor:<form id>:<uuid4> (' . $p[0]['rid'] . ')' );
T::eq( leaks( $p, $secrets ), false, 'no field value anywhere in the payload' );
$first_rid = $p[0]['rid'];
do_action( 'elementor_pro/forms/new_record', $record, new stdClass() );
$p = Rate1_Connector_Sender::pending();
T::eq( count( $p ), 1, 'hook fired twice in one request → still one payload' );
T::eq( $p[0]['rid'], $first_rid, 'rid stable within the request' );
$mock = mock_validate( '/v1/r', $p[0] );
if ( null !== $mock ) {
	T::ok( true === $mock['valid'], 'mock collector: valid against server-request.schema.json ' . json_encode( $mock['errors'] ) );
}
fresh_request( $visitor );
do_action( 'elementor_pro/forms/new_record', new stdClass(), null );
T::eq( count( Rate1_Connector_Sender::pending() ), 0, 'object without get_form_settings() ignored' );
fresh_request( $visitor );
do_action( 'elementor_pro/forms/new_record', new Stub_Elementor_Record( array(), array() ), null );
T::eq( count( Rate1_Connector_Sender::pending() ), 0, 'record without an id ignored' );

// ------------------------------------------------------------------
T::group( 'r1_pv / r1_path reading' );
foreach ( array( 'abc', 'Qm7Xk2Lp9Rt4Vb8N!', 'Qm7Xk2Lp9Rt4Vb8NX', 'Qm7Xk2Lp9Rt4Vb8-', '<script>Qm7Xk2Lp9' ) as $bad ) {
	fresh_request( array( 'r1_pv' => $bad ) );
	T::eq( Rate1_Connector_Forms::read_pv(), null, 'r1_pv ' . json_encode( $bad ) . ' → null' );
}
fresh_request( array( 'r1_pv' => array( PV ) ) );
T::eq( Rate1_Connector_Forms::read_pv(), null, 'r1_pv array → null' );
fresh_request( array() );
T::eq( Rate1_Connector_Forms::read_pv(), null, 'no r1_pv → null' );
fresh_request( array( 'r1_path' => '/caf\\é' ) );
T::eq( Rate1_Connector_Forms::read_path(), '/café', 'r1_path unslashed' );
fresh_request( array( 'r1_path' => 'no-slash' ) );
WP_Stub::$referer = 'https://site.example/kontakt/?x=1';
T::eq( Rate1_Connector_Forms::read_path(), '/kontakt', 'invalid r1_path → normalised referer path' );
fresh_request( array() );
WP_Stub::$referer = 'https://evil.example/kontakt/';
T::eq( Rate1_Connector_Forms::read_path(), null, 'no r1_path, cross-site referer → null' );
WP_Stub::$referer = false;

// ------------------------------------------------------------------
T::group( 'Contact Form 7 handler (stubbed objects; real CF7 is covered by the Docker integration test)' );
$cases = array(
	array( 'mail_sent', array(), 1, false, null ),
	array( 'spam', array( array( 'agent' => 'disallowed_list', 'reason' => 'x' ) ), 1, true, 'plugin' ),
	array( 'spam', array( array( 'agent' => 'wpcf7', 'reason' => 'x' ), array( 'agent' => 'honeypot', 'reason' => 'y' ) ), 1, true, 'honeypot' ),
	array( 'validation_failed', array(), 0, null, null ),
	array( 'mail_failed', array(), 0, null, null ),
	array( 'aborted', array(), 0, null, null ),
	array( 'acceptance_missing', array(), 0, null, null ),
);
foreach ( $cases as $c ) {
	fresh_request( $visitor );
	WPCF7_Submission::$log = $c[1];
	do_action( 'wpcf7_submit', new Stub_CF7_Form(), array( 'status' => $c[0], 'message' => 'x' ) );
	$p = Rate1_Connector_Sender::pending();
	T::eq( count( $p ), $c[2], "status {$c[0]} → {$c[2]} payload(s)" );
	if ( $c[2] ) {
		T::eq( array( $p[0]['spam'], $p[0]['spam_reason'] ), array( $c[3], $c[4] ), "status {$c[0]} → spam " . json_encode( $c[3] ) . ', reason ' . json_encode( $c[4] ) );
		T::ok( 1 === preg_match( '/^cf7:12:' . UUID . '$/', $p[0]['rid'] ), 'rid cf7:12:<uuid4>' );
		T::eq( r_payload_problems( $p[0] ), array(), 'schema ok' );
		T::eq( leaks( $p, $secrets ), false, 'no field values' );
	}
}

// ------------------------------------------------------------------
T::group( 'WPForms: wpforms_process_complete' );
fresh_request( $visitor );
do_action( 'wpforms_process_complete', array( 1 => array( 'value' => 'Jane Secretname' ) ), array( 'fields' => array( 'jane.secret@example.test' ) ), array( 'id' => 42, 'settings' => array( 'form_title' => 'Contact' ) ), 0 );
$p = Rate1_Connector_Sender::pending();
T::eq( count( $p ), 1, 'one payload' );
T::ok( 1 === preg_match( '/^wpforms:42:' . UUID . '$/', $p[0]['rid'] ), 'rid wpforms:42:<uuid4>' );
T::eq( array( $p[0]['source'], $p[0]['form_id'], $p[0]['spam'] ), array( 'wpforms', '42', false ), 'source, form_id, spam' );
T::eq( leaks( $p, $secrets ), false, 'no field values' );

// ------------------------------------------------------------------
T::group( 'Gravity Forms: gform_after_submission' );
fresh_request( $visitor );
do_action( 'gform_after_submission', array( 'id' => '99', 'form_id' => '3', 'status' => 'spam', '1' => 'Jane Secretname', '2' => 'jane.secret@example.test' ), array( 'id' => 3, 'title' => 'Contact' ) );
$p = Rate1_Connector_Sender::pending();
T::eq( count( $p ), 1, 'one payload' );
T::eq( $p[0]['rid'], 'gravity:3:99', 'rid uses the entry id' );
T::eq( array( $p[0]['spam'], $p[0]['spam_reason'] ), array( true, 'plugin' ), 'status spam → spam true, reason plugin' );
T::eq( leaks( $p, $secrets ), false, 'no field values' );
fresh_request( $visitor );
do_action( 'gform_after_submission', array( 'id' => '100', 'status' => 'active' ), array( 'id' => 3 ) );
$p = Rate1_Connector_Sender::pending();
T::eq( array( $p[0]['rid'], $p[0]['spam'], $p[0]['spam_reason'] ), array( 'gravity:3:100', false, null ), 'active entry → not spam' );

// ------------------------------------------------------------------
T::group( 'Limits and configuration' );
fresh_request( $visitor );
$p = Rate1_Connector_Forms::build_payload( 'elementor', str_repeat( 'x', 150 ), false, null );
T::eq( strlen( $p['form_id'] ), 100, 'form_id truncated to 100' );
T::ok( strlen( $p['rid'] ) <= 120, 'rid at most 120 characters (' . strlen( $p['rid'] ) . ')' );
T::eq( r_payload_problems( $p ), array(), 'schema ok' );
T::eq( Rate1_Connector_Forms::build_payload( 'cf7', "\x01 ", false, null ), null, 'empty form id → not sent' );
fresh_request( $visitor );
T::eq( Rate1_Connector_Forms::build_payload( 'cf7', '1', false, 'plugin' )['spam_reason'], null, 'spam_reason forced to null when not spam' );
fresh_request( $visitor );
delete_option( Rate1_Connector_Options::SITE_SECRET );
do_action( 'wpcf7_submit', new Stub_CF7_Form(), array( 'status' => 'mail_sent' ) );
T::eq( count( Rate1_Connector_Sender::pending() ), 0, 'no site secret → nothing sent' );
update_option( Rate1_Connector_Options::SITE_SECRET, 'sk_tooshort' );
do_action( 'wpcf7_submit', new Stub_CF7_Form(), array( 'status' => 'mail_sent' ) );
T::eq( count( Rate1_Connector_Sender::pending() ), 0, 'invalid site secret → nothing sent' );

// ------------------------------------------------------------------
T::group( 'Elementor form discovery (hello)' );
$tree  = json_decode( '[{"id":"s1","elType":"section","elements":[{"id":"c1","elType":"column","elements":[{"id":"a1b2c3","elType":"widget","widgetType":"form","settings":{"form_name":"Quick enquiry"}},{"id":"h1","elType":"widget","widgetType":"heading"}]}]},{"id":"d4e5f6","elType":"widget","widgetType":"form","settings":{}}]', true );
$found = array();
Rate1_Connector_Forms::walk_elementor( $tree, $found );
T::eq(
	array_values( $found ),
	array(
		array( 'source' => 'elementor', 'id' => 'a1b2c3', 'title' => 'Quick enquiry' ),
		array( 'source' => 'elementor', 'id' => 'd4e5f6', 'title' => '' ),
	),
	'nested form widgets found with element id and form_name'
);
