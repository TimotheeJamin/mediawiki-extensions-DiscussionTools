var
	Parser = require( 'ext.discussionTools.init' ).Parser,
	modifier = require( 'ext.discussionTools.init' ).modifier,
	utils = require( 'ext.discussionTools.init' ).utils,
	highlighter = require( './highlighter.js' ),
	parser = new Parser( document.getElementById( 'mw-content-text' ) ),
	comments = parser.getCommentItems(),
	threads = parser.getThreads(),
	timestampRegexps = parser.getLocalTimestampRegexps(),
	debug = +( new mw.Uri().query.dtdebug ),
	DEBUG_HIGHLIGHT = 1,
	DEBUG_VOTE = 2,
	DEBUG_VOTE_PERMISSIVE = 4;

// eslint-disable-next-line no-bitwise
if ( debug & DEBUG_HIGHLIGHT ) {
	highlighter.markThreads( threads );

	comments.forEach( function ( comment ) {
		comment.signatureRanges.forEach( function ( signatureRange ) {
			var node = signatureRange.endContainer;
			var match = parser.findTimestamp( node, timestampRegexps );
			if ( !match ) {
				return;
			}
			var signature = parser.findSignature( node )[ 0 ];
			var emptySignature = signature.length === 1 && signature[ 0 ] === node;
			// Note that additional content may follow the timestamp (e.g. in some voting formats), but we
			// don't care about it. The code below doesn't mark that due to now the text nodes are sliced,
			// but we might need to take care to use the matched range of node in other cases.
			highlighter.markTimestamp( parser, node, match );
			if ( !emptySignature ) {
				highlighter.markSignature( signature );
			}
		} );
	} );
}

// eslint-disable-next-line no-bitwise
if ( ( debug & DEBUG_VOTE ) || ( debug & DEBUG_VOTE_PERMISSIVE ) ) {
	threads.forEach( function ( thread ) {
		var firstComment = thread.replies[ 0 ];

		if ( firstComment && firstComment.type === 'comment' ) {
			// eslint-disable-next-line no-bitwise
			if ( !( debug & DEBUG_VOTE_PERMISSIVE ) && firstComment.level <= 1 ) {
				// Not in permissive vote mode, and first reply was not indented
				return;
			}

			var firstVote = firstComment.level === 1 ?
				// In permissive mode, the first vote is the replies to the OP
				firstComment.replies[ 0 ] :
				firstComment;

			if ( !firstVote ) {
				return;
			}

			var lastReply;
			var level = firstVote.level;
			firstVote.parent.replies.forEach( function ( reply ) {
				if ( reply.type === 'comment' && reply.level <= level ) {
					lastReply = reply;
				}
			} );

			var listItem = modifier.addSiblingListItem(
				utils.closestElement( lastReply.range.endContainer, [ 'li', 'dd', 'p' ] )
			);
			if ( listItem && listItem.tagName.toLowerCase() === 'li' ) {
				$( listItem )
					// Hide bullet/number
					.css( 'list-style', 'none' )
					.append(
						'[ ',
						$( '<a>' ).text( 'add comment' ),
						' ]'
					);
			}
		}
	} );
}
