'use strict';

var initialOffset, indentWidth, firstMarker;

function markTimestamp( parser, node, match ) {
	var dfParsers = parser.getLocalTimestampParsers();

	var newNode = node.splitText( match.matchData.index );
	newNode.splitText( match.matchData[ 0 ].length );

	var wrapper = document.createElement( 'span' );
	wrapper.className = 'ext-discussiontools-highlighter-timestamp';
	// We might need to actually port all the date formatting code from MediaWiki's PHP code
	// if we want to support displaying dates in all the formats available in user preferences
	// (which include formats in several non-Gregorian calendars).
	var date = dfParsers[ match.parserIndex ]( match.matchData );
	wrapper.title = date.format() + ' / ' + date.fromNow();
	wrapper.appendChild( newNode );
	node.parentNode.insertBefore( wrapper, node.nextSibling );
}

function markSignature( sigNodes ) {
	var
		where = sigNodes[ 0 ],
		wrapper = document.createElement( 'span' );
	wrapper.className = 'ext-discussiontools-highlighter-signature';
	where.parentNode.insertBefore( wrapper, where );
	while ( sigNodes.length ) {
		wrapper.appendChild( sigNodes.pop() );
	}
}

function fixFakeFirstHeadingRect( rect, comment ) {
	// If the page has comments before the first section heading, they are connected to a "fake"
	// heading with an empty range. Visualize the page title as the heading for that section.
	if ( rect.x === 0 && rect.y === 0 && comment.type === 'heading' ) {
		var node = document.getElementsByClassName( 'firstHeading' )[ 0 ];
		return node.getBoundingClientRect();
	}
	return rect;
}

function calculateSizes() {
	if ( initialOffset !== undefined ) {
		return;
	}

	// eslint-disable-next-line no-jquery/no-global-selector
	var rtl = $( 'html' ).attr( 'dir' ) === 'rtl';
	// eslint-disable-next-line no-jquery/no-global-selector
	var $content = $( '#mw-content-text' );
	var $test = $( '<dd>' ).appendTo( $( '<dl>' ).appendTo( $content ) );
	var rect = $content[ 0 ].getBoundingClientRect();

	initialOffset = rtl ? document.body.scrollWidth - rect.left - rect.width : rect.left;
	indentWidth = parseFloat( $test.css( rtl ? 'margin-right' : 'margin-left' ) ) +
		parseFloat( $test.parent().css( rtl ? 'margin-right' : 'margin-left' ) );

	$test.parent().remove();
}

function markComment( comment ) {
	var
		// eslint-disable-next-line no-jquery/no-global-selector
		rtl = $( 'html' ).attr( 'dir' ) === 'rtl',
		rect = comment.getNativeRange().getBoundingClientRect(),
		marker = document.createElement( 'div' ),
		marker2 = document.createElement( 'div' ),
		scrollTop = document.documentElement.scrollTop || document.body.scrollTop,
		scrollLeft = document.documentElement.scrollLeft || document.body.scrollLeft;

	rect = fixFakeFirstHeadingRect( rect, comment );

	marker.className = 'ext-discussiontools-highlighter-comment';
	marker.style.top = ( rect.top + scrollTop ) + 'px';
	marker.style.height = ( rect.height ) + 'px';
	marker.style.left = ( rect.left + scrollLeft ) + 'px';
	marker.style.width = ( rect.width ) + 'px';

	if ( !firstMarker ) {
		firstMarker = marker;
	}

	if ( comment.warnings && comment.warnings.length ) {
		var markerWarnings = marker.cloneNode( false );
		markerWarnings.className = 'ext-discussiontools-highlighter-comment-warnings';
		markerWarnings.innerText = comment.warnings.join( '\n' );
		// Group warnings at the top as we use nth-child selectors
		// to alternate color of markers.
		document.body.insertBefore( markerWarnings, firstMarker );
	}

	document.body.appendChild( marker );

	calculateSizes();

	if ( comment.parent ) {
		var parentRect = comment.parent.getNativeRange().getBoundingClientRect();
		parentRect = fixFakeFirstHeadingRect( parentRect, comment.parent );
		if ( comment.parent.level === 0 ) {
			// Twiddle so that it looks nice
			parentRect = $.extend( {}, parentRect );
			parentRect.height -= 10;
		}

		marker2.className = 'ext-discussiontools-highlighter-comment-ruler';
		marker2.style.top = ( parentRect.top + parentRect.height + scrollTop ) + 'px';
		marker2.style.height = ( rect.top - ( parentRect.top + parentRect.height ) + 10 ) + 'px';
		if ( rtl ) {
			marker2.style.right = ( initialOffset - indentWidth / 2 + comment.parent.level * indentWidth ) + 'px';
			marker2.style.width = ( ( comment.level - comment.parent.level ) * indentWidth - indentWidth / 2 ) - 2 + 'px';
		} else {
			marker2.style.left = ( initialOffset - indentWidth / 2 + comment.parent.level * indentWidth ) + 'px';
			marker2.style.width = ( ( comment.level - comment.parent.level ) * indentWidth - indentWidth / 2 ) - 2 + 'px';
		}
		document.body.appendChild( marker2 );
	}

	for ( var i = 0; i < comment.replies.length; i++ ) {
		markComment( comment.replies[ i ] );
	}
}

function markThreads( threads ) {
	for ( var i = 0; i < threads.length; i++ ) {
		markComment( threads[ i ] );
	}
	// Reverse order so that box-shadows look right
	// eslint-disable-next-line no-jquery/no-global-selector
	$( 'body' ).append( $( '.ext-discussiontools-highlighter-comment-ruler' ).get().reverse() );
}

module.exports = {
	markThreads: markThreads,
	markTimestamp: markTimestamp,
	markSignature: markSignature
};
