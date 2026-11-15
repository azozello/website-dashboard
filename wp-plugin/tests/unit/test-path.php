<?php
/**
 * Path normalisation against the shared contract vectors (§1).
 */

T::group( 'Path normaliser: contract/v1/path-normalisation.json' );
$vectors = json_decode( file_get_contents( CONTRACT_DIR . '/path-normalisation.json' ), true );
T::ok( is_array( $vectors ) && count( $vectors['cases'] ) > 0, 'vectors loaded (' . count( $vectors['cases'] ) . ' cases)' );
foreach ( $vectors['cases'] as $case ) {
	list( $in, $want ) = $case;
	T::eq( Rate1_Connector_Path::normalise( $in ), $want, 'normalise(' . json_encode( $in, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) . ')' );
}

T::group( 'Path normaliser: extra cases' );
$long = '/' . str_repeat( 'ü', 600 );
T::eq( mb_strlen( Rate1_Connector_Path::normalise( $long ) ), 512, '600 characters truncated to 512 (UTF-8 safe)' );
T::ok( 1 === preg_match( '//u', Rate1_Connector_Path::normalise( $long ) ), 'truncated result is valid UTF-8' );
T::eq( Rate1_Connector_Path::normalise( 'HTTPS://Site.Example/A/B/' ), '/A/B', 'scheme match is case-insensitive, path case kept' );

T::group( 'r1_path field check' );
T::eq( Rate1_Connector_Path::clean_field( '/back-pain' ), '/back-pain', 'normal path kept' );
T::eq( Rate1_Connector_Path::clean_field( '/100%' ), '/100%', 'percent sign kept (not re-decoded)' );
T::eq( Rate1_Connector_Path::clean_field( '/a%20b%' ), '/a%20b%', 'undecoded path kept as-is' );
T::eq( Rate1_Connector_Path::clean_field( 'back-pain' ), null, 'not starting with "/" rejected' );
T::eq( Rate1_Connector_Path::clean_field( '' ), null, 'empty rejected' );
T::eq( Rate1_Connector_Path::clean_field( "/x\xFF" ), null, 'invalid UTF-8 rejected' );
T::eq( Rate1_Connector_Path::clean_field( "/a\nb\x00c" ), '/abc', 'control characters removed' );
T::eq( mb_strlen( Rate1_Connector_Path::clean_field( '/' . str_repeat( 'a', 700 ) ) ), 512, 'truncated to 512' );
T::eq( Rate1_Connector_Path::clean_field( array( '/x' ) ), null, 'array rejected' );

T::group( 'HTTP Referer fallback' );
WP_Stub::$referer = 'https://site.example/Kontakt/?utm_source=x#top';
T::eq( Rate1_Connector_Path::from_referer(), '/Kontakt', 'same-site referer normalised' );
WP_Stub::$referer = 'https://www.site.example/%C3%BCber-uns/';
T::eq( Rate1_Connector_Path::from_referer(), '/über-uns', 'www. variant of the home host accepted' );
WP_Stub::$referer = 'https://other.example/landing';
T::eq( Rate1_Connector_Path::from_referer(), null, 'other site rejected' );
WP_Stub::$referer = '/relative/path/';
T::eq( Rate1_Connector_Path::from_referer(), '/relative/path', 'relative referer accepted' );
WP_Stub::$referer = false;
T::eq( Rate1_Connector_Path::from_referer(), null, 'no referer → null' );
