'use strict';
/* global $:off */

/**
 * @external ThreadItem
 */

var
	utils = require( './utils.js' ),
	CommentItem = require( './CommentItem.js' ),
	HeadingItem = require( './HeadingItem.js' ),
	// Hooks::getLocalData()
	data = require( './parser/data.json' ),
	moment = require( './lib/moment-timezone/moment-timezone-with-data-1970-2030.js' );

/**
 * Utilities for detecting and parsing components of discussion pages: signatures, timestamps,
 * comments and threads.
 *
 * @class mw.dt.parser
 */

/**
 * Get text of localisation messages in content language.
 *
 * @private
 * @param {string[]} messages
 * @return {string[]}
 */
function getMessages( messages ) {
	return messages.map( function ( code ) {
		return data.contLangMessages[ code ];
	} );
}

/**
 * Get a regexp that matches timestamps generated using the given date format.
 *
 * This only supports format characters that are used by the default date format in any of
 * MediaWiki's languages, namely: D, d, F, G, H, i, j, l, M, n, Y, xg, xkY (and escape characters),
 * and only dates when MediaWiki existed, let's say 2000 onwards (Thai dates before 1941 are
 * complicated).
 *
 * @param {string} format Date format, as used by MediaWiki
 * @param {string} digitsRegexp Regular expression matching a single localised digit, e.g. `[0-9]`
 * @param {Object} tzAbbrs Map of localised timezone abbreviations to IANA abbreviations
 *   for the local timezone, e.g. `{EDT: "EDT", EST: "EST"}`
 * @return {string} Regular expression
 */
function getTimestampRegexp( format, digitsRegexp, tzAbbrs ) {
	var s, p, num, code, endQuote, tzRegexp, regexp;

	function regexpGroup( regexp ) {
		return '(' + regexp + ')';
	}

	function regexpAlternateGroup( array ) {
		return '(' + array.map( mw.util.escapeRegExp ).join( '|' ) + ')';
	}

	s = '';
	// Adapted from Language::sprintfDate()
	for ( p = 0; p < format.length; p++ ) {
		num = false;
		code = format[ p ];
		if ( code === 'x' && p < format.length - 1 ) {
			code += format[ ++p ];
		}
		if ( code === 'xk' && p < format.length - 1 ) {
			code += format[ ++p ];
		}

		switch ( code ) {
			case 'xx':
				s += 'x';
				break;
			case 'xg':
				s += regexpAlternateGroup( getMessages( [
					'january-gen', 'february-gen', 'march-gen', 'april-gen', 'may-gen', 'june-gen',
					'july-gen', 'august-gen', 'september-gen', 'october-gen', 'november-gen',
					'december-gen'
				] ) );
				break;
			case 'd':
				num = '2';
				break;
			case 'D':
				s += regexpAlternateGroup( getMessages( [
					'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'
				] ) );
				break;
			case 'j':
				num = '1,2';
				break;
			case 'l':
				s += regexpAlternateGroup( getMessages( [
					'sunday', 'monday', 'tuesday', 'wednesday', 'thursday',
					'friday', 'saturday'
				] ) );
				break;
			case 'F':
				s += regexpAlternateGroup( getMessages( [
					'january', 'february', 'march', 'april', 'may_long', 'june',
					'july', 'august', 'september', 'october', 'november',
					'december'
				] ) );
				break;
			case 'M':
				s += regexpAlternateGroup( getMessages( [
					'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug',
					'sep', 'oct', 'nov', 'dec'
				] ) );
				break;
			case 'n':
				num = '1,2';
				break;
			case 'Y':
				num = '4';
				break;
			case 'xkY':
				num = '4';
				break;
			case 'G':
				num = '1,2';
				break;
			case 'H':
				num = '2';
				break;
			case 'i':
				num = '2';
				break;
			case '\\':
				// Backslash escaping
				if ( p < format.length - 1 ) {
					s += mw.util.escapeRegExp( format[ ++p ] );
				} else {
					s += mw.util.escapeRegExp( '\\' );
				}
				break;
			case '"':
				// Quoted literal
				if ( p < format.length - 1 ) {
					endQuote = format.indexOf( '"', p + 1 );
					if ( endQuote === -1 ) {
						// No terminating quote, assume literal "
						s += '"';
					} else {
						s += mw.util.escapeRegExp( format.substr( p + 1, endQuote - p - 1 ) );
						p = endQuote;
					}
				} else {
					// Quote at end of string, assume literal "
					s += '"';
				}
				break;
			default:
				s += mw.util.escapeRegExp( format[ p ] );
		}
		if ( num !== false ) {
			s += regexpGroup( digitsRegexp + '{' + num + '}' );
		}
	}

	tzRegexp = regexpAlternateGroup( Object.keys( tzAbbrs ) );
	// Hard-coded parentheses and space like in Parser::pstPass2
	// Ignore some invisible Unicode characters that often sneak into copy-pasted timestamps (T245784)
	regexp = s + '[\\u200E\\u200F]? [\\u200E\\u200F]?\\(' + tzRegexp + '\\)';

	return regexp;
}

/**
 * Get a function that parses timestamps generated using the given date format, based on the result
 * of matching the regexp returned by #getTimestampRegexp.
 *
 * @param {string} format Date format, as used by MediaWiki
 * @param {string|null} digits Localised digits from 0 to 9, e.g. `0123456789`
 * @param {string} localTimezone Local timezone IANA name, e.g. `America/New_York`
 * @param {Object} tzAbbrs Map of localised timezone abbreviations to IANA abbreviations
 *   for the local timezone, e.g. `{EDT: "EDT", EST: "EST"}`
 * @return {Function} Parser function
 * @return {Array} return.match Regexp match data
 * @return {Object} return.return Moment object
 */
function getTimestampParser( format, digits, localTimezone, tzAbbrs ) {
	var p, code, endQuote, matchingGroups = [];
	for ( p = 0; p < format.length; p++ ) {
		code = format[ p ];
		if ( code === 'x' && p < format.length - 1 ) {
			code += format[ ++p ];
		}
		if ( code === 'xk' && p < format.length - 1 ) {
			code += format[ ++p ];
		}

		switch ( code ) {
			case 'xx':
				break;
			case 'xg':
			case 'd':
			case 'j':
			case 'D':
			case 'l':
			case 'F':
			case 'M':
			case 'n':
			case 'Y':
			case 'xkY':
			case 'G':
			case 'H':
			case 'i':
				matchingGroups.push( code );
				break;
			case '\\':
				// Backslash escaping
				if ( p < format.length - 1 ) {
					++p;
				}
				break;
			case '"':
				// Quoted literal
				if ( p < format.length - 1 ) {
					endQuote = format.indexOf( '"', p + 1 );
					if ( endQuote !== -1 ) {
						p = endQuote;
					}
				}
				break;
			default:
				break;
		}
	}

	function untransformDigits( text ) {
		if ( !digits ) {
			return text;
		}
		return text.replace(
			new RegExp( '[' + digits + ']', 'g' ),
			function ( m ) {
				return digits.indexOf( m );
			}
		);
	}

	return function timestampParser( match ) {
		var
			year = 0,
			monthIdx = 0,
			day = 0,
			hour = 0,
			minute = 0,
			tzAbbr,
			i, code, text,
			date;
		for ( i = 0; i < matchingGroups.length; i++ ) {
			code = matchingGroups[ i ];
			text = match[ i + 1 ];

			switch ( code ) {
				case 'xg':
					monthIdx = getMessages( [
						'january-gen', 'february-gen', 'march-gen', 'april-gen', 'may-gen', 'june-gen',
						'july-gen', 'august-gen', 'september-gen', 'october-gen', 'november-gen',
						'december-gen'
					] ).indexOf( text );
					break;
				case 'd':
				case 'j':
					day = Number( untransformDigits( text ) );
					break;
				case 'D':
				case 'l':
					// Day of the week - unused
					break;
				case 'F':
					monthIdx = getMessages( [
						'january', 'february', 'march', 'april', 'may_long', 'june',
						'july', 'august', 'september', 'october', 'november',
						'december'
					] ).indexOf( text );
					break;
				case 'M':
					monthIdx = getMessages( [
						'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug',
						'sep', 'oct', 'nov', 'dec'
					] ).indexOf( text );
					break;
				case 'n':
					monthIdx = Number( untransformDigits( text ) ) - 1;
					break;
				case 'Y':
					year = Number( untransformDigits( text ) );
					break;
				case 'xkY':
					// Thai year
					year = Number( untransformDigits( text ) ) - 543;
					break;
				case 'G':
				case 'H':
					hour = Number( untransformDigits( text ) );
					break;
				case 'i':
					minute = Number( untransformDigits( text ) );
					break;
				default:
					throw new Error( 'Not implemented' );
			}
		}
		// The last matching group is the timezone abbreviation
		tzAbbr = tzAbbrs[ match[ match.length - 1 ] ];

		// Most of the time, the timezone abbreviation is not necessary to parse the date, since we
		// can assume all times are in the wiki's local timezone.
		date = moment.tz( [ year, monthIdx, day, hour, minute ], localTimezone );

		// But during the "fall back" at the end of DST, some times will happen twice. Per the docs,
		// "Moment Timezone handles this by always using the earlier instance of a duplicated hour."
		// https://momentjs.com/timezone/docs/#/using-timezones/parsing-ambiguous-inputs/

		// Since the timezone abbreviation disambiguates the DST/non-DST times, we can detect when
		// that behavior was incorrect...
		if ( date.zoneAbbr() !== tzAbbr ) {
			// ...and force the correct parsing. I can't find proper documentation for this feature,
			// but this pull request explains it: https://github.com/moment/moment-timezone/pull/101
			moment.tz.moveAmbiguousForward = true;
			date = moment.tz( [ year, monthIdx, day, hour, minute ], localTimezone );
			moment.tz.moveAmbiguousForward = false;
			if ( date.zoneAbbr() !== tzAbbr ) {
				// This should not be possible for "genuine" timestamps generated by MediaWiki.
				// But bots and humans get it wrong when marking up unsigned comments…
				// https://pl.wikipedia.org/w/index.php?title=Wikipedia:Kawiarenka/Artykuły&diff=prev&oldid=54772606
				date.discussionToolsWarning = 'Timestamp has timezone abbreviation for the wrong time';
			} else {
				date.discussionToolsWarning = 'Ambiguous time at DST switchover was parsed';
			}
		}

		return date;
	};
}

/**
 * Get a regexp that matches timestamps in the local date format.
 *
 * This calls #getTimestampRegexp with predefined data for the current wiki.
 *
 * @private
 * @return {string} Regular expression
 */
function getLocalTimestampRegexp() {
	return getTimestampRegexp(
		data.dateFormat,
		data.digits ? '[' + data.digits + ']' : '\\d',
		data.timezones
	);
}

/**
 * Get a function that parses timestamps in the local date format, based on the result
 * of matching the regexp returned by #getLocalTimestampRegexp.
 *
 * This calls #getTimestampParser with predefined data for the current wiki.
 *
 * @private
 * @return {Function} Parser function
 * @return {Array} return.match Regexp match data
 * @return {Date} return.return
 */
function getLocalTimestampParser() {
	return getTimestampParser(
		data.dateFormat,
		data.digits,
		data.localTimezone,
		data.timezones
	);
}

/**
 * Callback for document.createTreeWalker that will skip over nodes where we don't want to detect
 * comments (or section headings).
 *
 * @param {Node} node
 * @return {number} Appropriate NodeFilter constant
 */
function acceptOnlyNodesAllowingComments( node ) {
	// The table of contents has a heading that gets erroneously detected as a section
	if ( node.id === 'toc' ) {
		return NodeFilter.FILTER_REJECT;
	}
	return NodeFilter.FILTER_ACCEPT;
}

/**
 * Find all timestamps within a DOM subtree.
 *
 * @param {HTMLElement} rootNode Node to search
 * @return {Array[]} Results. Each result is a two-element array.
 * @return {Text} return.0 Text node containing the timestamp
 * @return {Array} return.1 Regexp match data, which specifies the location of the match, and which
 *   can be parsed using #getLocalTimestampParser
 */
function findTimestamps( rootNode ) {
	var
		matches = [],
		treeWalker = rootNode.ownerDocument.createTreeWalker(
			rootNode,
			NodeFilter.SHOW_TEXT,
			acceptOnlyNodesAllowingComments,
			false
		),
		dateRegexp = getLocalTimestampRegexp(),
		node, startNode, nodeText, match;

	while ( ( node = treeWalker.nextNode() ) ) {
		startNode = node;
		nodeText = '';

		while ( node ) {
			nodeText += node.nodeValue;

			// In Parsoid HTML, entities are represented as a 'mw:Entity' node, rather than normal HTML
			// entities. On Arabic Wikipedia, the "UTC" timezone name contains some non-breaking spaces,
			// which apparently are often turned into &nbsp; entities by buggy editing tools. To handle
			// this, we must piece together the text, so that our regexp can match those timestamps.
			if (
				node.nextSibling &&
				node.nextSibling.nodeType === Node.ELEMENT_NODE &&
				node.nextSibling.getAttribute( 'typeof' ) === 'mw:Entity'
			) {
				nodeText += node.nextSibling.firstChild.nodeValue;

				// If the entity is followed by more text, do this again
				if (
					node.nextSibling.nextSibling &&
					node.nextSibling.nextSibling.nodeType === Node.TEXT_NODE
				) {
					node = node.nextSibling.nextSibling;
				} else {
					node = null;
				}
			} else {
				node = null;
			}
		}

		// Technically, there could be multiple matches in a single text node. However, the ultimate
		// point of this is to find the signatures which precede the timestamps, and any later
		// timestamps in the text node can't be directly preceded by a signature (as we require them to
		// have links), so we only concern ourselves with the first match.
		if ( ( match = nodeText.match( dateRegexp ) ) ) {
			matches.push( [ startNode, match ] );
		}
	}
	return matches;
}

/**
 * Get a MediaWiki page title from a URL.
 *
 * @private
 * @param {string} url
 * @return {mw.Title|null} Page title, or null if this isn't a link to a page
 */
function getTitleFromUrl( url ) {
	var articlePathRegexp, match;

	try {
		url = new mw.Uri( url );
	} catch ( err ) {
		// T106244: URL encoded values using fallback 8-bit encoding (invalid UTF-8) cause mediawiki.Uri to crash
		return null;
	}
	articlePathRegexp = new RegExp(
		mw.util.escapeRegExp( mw.config.get( 'wgArticlePath' ) )
			.replace( mw.util.escapeRegExp( '$1' ), '(.*)' )
	);

	if ( ( match = url.path.match( articlePathRegexp ) ) ) {
		return mw.Title.newFromText( decodeURIComponent( match[ 1 ] ) );
	}
	if ( url.query.title ) {
		return mw.Title.newFromText( url.query.title );
	}
	return null;
}

/**
 * Find a user signature preceding a timestamp.
 *
 * The signature includes the timestamp node.
 *
 * A signature must contain at least one link to the user's userpage, discussion page or
 * contributions (and may contain other links). The link may be nested in other elements.
 *
 * @private
 * @param {Text} timestampNode Text node
 * @param {Node} [until] Node to stop searching at
 * @return {Array} Result, a two-element array
 * @return {Node[]} return.0 Sibling nodes comprising the signature, in reverse order (with
 *   `timestampNode` or its parent node as the first element)
 * @return {string|null} return.1 Username, null for unsigned comments
 */
function findSignature( timestampNode, until ) {
	var node, sigNodes, sigUsername, length, lastLinkNode, links, nodes;

	// Support timestamps being linked to the diff introducing the comment:
	// if the timestamp node is the only child of a link node, use the link node instead
	if (
		!timestampNode.previousSibling && !timestampNode.nextSibling &&
		timestampNode.parentNode.nodeName.toLowerCase() === 'a'
	) {
		timestampNode = timestampNode.parentNode;
	}

	node = timestampNode;
	sigNodes = [ node ];
	sigUsername = null;
	length = 0;
	lastLinkNode = timestampNode;

	while ( ( node = node.previousSibling ) && length < data.signatureScanLimit && node !== until ) {
		sigNodes.push( node );
		length += ( node.textContent || '' ).length;
		if ( node.nodeType !== Node.ELEMENT_NODE ) {
			continue;
		}
		links = [];
		if ( node.tagName.toLowerCase() === 'a' ) {
			links.push( node );
		} else {
			// Handle links nested in formatting elements.
			// Helpful accidental feature: users whose signature is not detected in full (due to
			// text formatting) can just wrap it in a <span> to fix that.
			// "Ten Pound Hammer • (What did I screw up now?)"
			// "« Saper // dyskusja »"
			nodes = node.getElementsByTagName( 'a' );
			links.push.apply( links, nodes );
		}
		if ( !links.length ) {
			continue;
		}
		// Use .some() rather than .every() to permit vanity links
		// "TonyTheTiger (T / C / WP:FOUR / WP:CHICAGO / WP:WAWARD)"
		// eslint-disable-next-line no-loop-func
		if ( links.some( function ( link ) {
			var username, title;
			title = getTitleFromUrl( link.href );
			if ( !title ) {
				return false;
			}
			if (
				title.getNamespaceId() === mw.config.get( 'wgNamespaceIds' ).user ||
				title.getNamespaceId() === mw.config.get( 'wgNamespaceIds' ).user_talk
			) {
				username = title.getMainText();
				if ( username.indexOf( '/' ) !== -1 ) {
					return false;
				}
			} else if (
				title.getNamespaceId() === mw.config.get( 'wgNamespaceIds' ).special &&
				title.getMainText().split( '/' )[ 0 ] === data.specialContributionsName
			) {
				username = title.getMainText().split( '/' )[ 1 ];
				// Normalize the username: users may link to their contributions with an unnormalized name
				username = mw.Title.makeTitle( mw.config.get( 'wgNamespaceIds' ).user, username ).getMainText();
			}
			if ( !username ) {
				return false;
			}
			if ( mw.util.isIPv6Address( username ) ) {
				// Bot-generated links "Preceding unsigned comment added by" have non-standard case
				username = username.toUpperCase();
			}

			// Accept the first link to the user namespace, then only accept links to that user
			if ( !sigUsername ) {
				sigUsername = username;
			}
			return username === sigUsername;
		} ) ) {
			lastLinkNode = node;
		}
		// Keep looking if a node with links wasn't a link to a user page
		// "Doc James (talk · contribs · email)"
	}
	// Pop excess text nodes
	while ( sigNodes[ sigNodes.length - 1 ] !== lastLinkNode ) {
		sigNodes.pop();
	}
	return [ sigNodes, sigUsername ];
}

/**
 * Get the indent level of a node, relative to its ancestor node.
 *
 * The indent level is the number of lists inside of which it is nested.
 *
 * @private
 * @param {Node} node
 * @param {HTMLElement} rootNode Node to stop counting at
 * @return {number}
 */
function getIndentLevel( node, rootNode ) {
	var indent = 0, tagName;
	while ( node ) {
		if ( node === rootNode ) {
			break;
		}
		tagName = node.tagName && node.tagName.toLowerCase();
		if ( tagName === 'li' || tagName === 'dd' ) {
			indent++;
		}
		node = node.parentNode;
	}
	return indent;
}

/**
 * Return the next leaf node in the tree order that is not an empty or whitespace-only text node.
 *
 * In other words, this returns a Text node with content other than whitespace, or an Element node
 * with no children, that follows the given node in the HTML source.
 *
 * @private
 * @param {Node} node Node to start searching at. If it isn't a leaf node, its children are ignored.
 * @param {HTMLElement} rootNode Node to stop searching at
 * @return {Node}
 */
function nextInterestingLeafNode( node, rootNode ) {
	var treeWalker = rootNode.ownerDocument.createTreeWalker(
		rootNode,
		// eslint-disable-next-line no-bitwise
		NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
		function ( n ) {
			// Ignore this node and its descendants
			// (unless it's the root node, this is a special case for "fakeHeading" handling)
			if ( node !== rootNode && ( n === node || n.parentNode === node ) ) {
				return NodeFilter.FILTER_REJECT;
			}
			if (
				( n.nodeType === Node.TEXT_NODE && utils.htmlTrim( n.textContent ) !== '' ) ||
				( n.nodeType === Node.CDATA_SECTION_NODE && utils.htmlTrim( n.textContent ) !== '' ) ||
				( n.nodeType === Node.ELEMENT_NODE && !n.firstChild )
			) {
				return NodeFilter.FILTER_ACCEPT;
			}
			return NodeFilter.FILTER_SKIP;
		},
		false
	);
	treeWalker.currentNode = node;
	treeWalker.nextNode();
	if ( !treeWalker.currentNode ) {
		throw new Error( 'nextInterestingLeafNode not found' );
	}
	return treeWalker.currentNode;
}

/**
 * Get all discussion comments (and headings) within a DOM subtree.
 *
 * This returns a flat list, use #groupThreads to associate replies to original messages and get a
 * tree structure starting at section headings.
 *
 * For example, for a MediaWiki discussion like this (we're dealing with HTML DOM here, the wikitext
 * syntax is just for illustration):
 *
 *     == A ==
 *     B. ~~~~
 *     : C.
 *     : C. ~~~~
 *     :: D. ~~~~
 *     ::: E. ~~~~
 *     ::: F. ~~~~
 *     : G. ~~~~
 *     H. ~~~~
 *     : I. ~~~~
 *
 * This function would return a structure like:
 *
 *     [
 *       { type: 'heading', level: 0, range: (h2: A)        },
 *       { type: 'comment', level: 1, range: (p: B)         },
 *       { type: 'comment', level: 2, range: (li: C, li: C) },
 *       { type: 'comment', level: 3, range: (li: D)        },
 *       { type: 'comment', level: 4, range: (li: E)        },
 *       { type: 'comment', level: 4, range: (li: F)        },
 *       { type: 'comment', level: 2, range: (li: G)        },
 *       { type: 'comment', level: 1, range: (p: H)         },
 *       { type: 'comment', level: 2, range: (li: I)        }
 *     ]
 *
 * @param {HTMLElement} rootNode
 * @return {ThreadItem[]} Results. Each result is an object.
 * @return {string} return.type `heading` or `comment`
 * @return {Object} return.range Object describing the extent of the comment, including the
 *   signature and timestamp. It has the same properties as a Range object: `startContainer`,
 *   `startOffset`, `endContainer`, `endOffset` (we don't use a real Range because they change
 *   magically when the DOM structure changes).
 * @return {Object[]} [return.signatureRanges] Objects describing the extent of signatures (plus
 *   timestamps) for this comment. There is always at least one signature, but there may be
 *   multiple. The author and timestamp of the comment is determined from the first signature.
 *   The last node in every signature range is a node containing the timestamp.
 * @return {number} return.level Indentation level of the comment. Headings are `0`, comments start
 *   at `1`.
 * @return {Object} [return.timestamp] Timestamp (Moment object), undefined for headings
 * @return {string} [return.author] Comment author's username, undefined for headings
 */
function getComments( rootNode ) {
	var
		dfParser = getLocalTimestampParser(),
		comments = [],
		timestamps, nextTimestamp, treeWalker,
		node, range, fakeHeading, curComment,
		foundSignature, firstSigNode, lastSigNode, sigRange, author, startNode, match, startLevel, endLevel, dateTime, warnings;

	timestamps = findTimestamps( rootNode );

	treeWalker = rootNode.ownerDocument.createTreeWalker(
		rootNode,
		// eslint-disable-next-line no-bitwise
		NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
		acceptOnlyNodesAllowingComments,
		false
	);

	// Placeholder heading in case there are comments in the 0th section
	range = {
		startContainer: rootNode,
		startOffset: 0,
		endContainer: rootNode,
		endOffset: 0
	};
	fakeHeading = new HeadingItem( range, true );

	curComment = fakeHeading;

	nextTimestamp = 0;
	while ( ( node = treeWalker.nextNode() ) ) {
		if ( node.tagName && node.tagName.match( /^h[1-6]$/i ) ) {
			range = {
				startContainer: node,
				startOffset: 0,
				endContainer: node,
				endOffset: node.childNodes.length
			};
			curComment = new HeadingItem( range );
			comments.push( curComment );
		} else if ( timestamps[ nextTimestamp ] && node === timestamps[ nextTimestamp ][ 0 ] ) {
			warnings = [];
			foundSignature = findSignature( node, curComment.range.endContainer );
			author = foundSignature[ 1 ];
			firstSigNode = foundSignature[ 0 ][ foundSignature[ 0 ].length - 1 ];
			lastSigNode = foundSignature[ 0 ][ 0 ];

			if ( !author ) {
				// Ignore timestamps for which we couldn't find a signature. It's probably not a real
				// comment, but just a false match due to a copypasted timestamp.
				nextTimestamp++;
				continue;
			}

			// Everything from last comment up to here is the next comment
			startNode = nextInterestingLeafNode( curComment.range.endContainer, rootNode );
			match = timestamps[ nextTimestamp ][ 1 ];
			range = {
				startContainer: startNode.parentNode,
				startOffset: utils.childIndexOf( startNode ),
				endContainer: lastSigNode === node ? node : lastSigNode.parentNode,
				endOffset: lastSigNode === node ? match.index + match[ 0 ].length : utils.childIndexOf( lastSigNode ) + 1
			};
			sigRange = {
				startContainer: firstSigNode.parentNode,
				startOffset: utils.childIndexOf( firstSigNode ),
				endContainer: lastSigNode === node ? node : lastSigNode.parentNode,
				endOffset: lastSigNode === node ? match.index + match[ 0 ].length : utils.childIndexOf( lastSigNode ) + 1
			};

			startLevel = getIndentLevel( startNode, rootNode ) + 1;
			endLevel = getIndentLevel( node, rootNode ) + 1;
			if ( startLevel !== endLevel ) {
				warnings.push( 'Comment starts and ends with different indentation' );
			}

			// Avoid generating multiple comments when there is more than one signature on a single "line".
			// Often this is done when someone edits their comment later and wants to add a note about that.
			// (Or when another person corrects a typo, or strikes out a comment, etc.) Multiple comments
			// within one paragraph/list-item result in a confusing double "Reply" button, and we also have
			// no way to indicate which one you're replying to (this might matter in the future for
			// notifications or something).
			if (
				curComment instanceof CommentItem &&
				( utils.closestElement( node, [ 'li', 'dd', 'p' ] ) || node.parentNode ) ===
					( utils.closestElement( curComment.range.endContainer, [ 'li', 'dd', 'p' ] ) || curComment.range.endContainer.parentNode )
			) {
				// Merge this with the previous comment. Use that comment's author and timestamp.
				curComment.range.endContainer = range.endContainer;
				curComment.range.endOffset = range.endOffset;
				curComment.signatureRanges.push( sigRange );
				curComment.level = Math.min( Math.min( startLevel, endLevel ), curComment.level );

				nextTimestamp++;
				continue;
			}

			dateTime = dfParser( match );
			if ( dateTime.discussionToolsWarning ) {
				warnings.push( dateTime.discussionToolsWarning );
			}

			curComment = new CommentItem(
				// Should this use the indent level of `startNode` or `node`?
				Math.min( startLevel, endLevel ),
				range,
				[ sigRange ],
				dateTime,
				author
			);
			if ( warnings.length ) {
				curComment.warnings = warnings;
			}
			comments.push( curComment );
			nextTimestamp++;
		}
	}

	// Insert the fake placeholder heading if there are any comments in the 0th section
	// (before the first real heading)
	if ( comments.length && !( comments[ 0 ] instanceof HeadingItem ) ) {
		comments.unshift( fakeHeading );
	}

	return comments;
}

/**
 * Group discussion comments into threads and associate replies to original messages.
 *
 * Each thread must begin with a heading. Original messages in the thread are treated as replies to
 * its heading. Other replies are associated based on the order and indentation level.
 *
 * Note that the objects in `comments` are extended in-place with the additional data.
 *
 * For example, for a MediaWiki discussion like this (we're dealing with HTML DOM here, the wikitext
 * syntax is just for illustration):
 *
 *     == A ==
 *     B. ~~~~
 *     : C.
 *     : C. ~~~~
 *     :: D. ~~~~
 *     ::: E. ~~~~
 *     ::: F. ~~~~
 *     : G. ~~~~
 *     H. ~~~~
 *     : I. ~~~~
 *
 * This function would return a structure like:
 *
 *     [
 *       { type: 'heading', level: 0, range: (h2: A), replies: [
 *         { type: 'comment', level: 1, range: (p: B), replies: [
 *           { type: 'comment', level: 2, range: (li: C, li: C), replies: [
 *             { type: 'comment', level: 3, range: (li: D), replies: [
 *               { type: 'comment', level: 4, range: (li: E), replies: [] },
 *               { type: 'comment', level: 4, range: (li: F), replies: [] },
 *             ] },
 *           ] },
 *           { type: 'comment', level: 2, range: (li: G), replies: [] },
 *         ] },
 *         { type: 'comment', level: 1, range: (p: H), replies: [
 *           { type: 'comment', level: 2, range: (li: I), replies: [] },
 *         ] },
 *       ] },
 *     ]
 *
 * @param {ThreadItem} comments Result of #getComments
 * @return {HeadingItem[]} Tree structure of comments, using the same objects as `comments`. Top-level
 *   items are the headings. The following properties are added:
 * @return {string} return.id Unique ID (within the page) for this comment, intended to be used to
 *   find this comment in other revisions of the same page
 * @return {Object[]} return.replies Comment objects which are replies to this comment
 * @return {Object|null} return.parent Comment object which this is a reply to (null for headings)
 */
function groupThreads( comments ) {
	var
		threads = [],
		replies = [],
		commentsById = {},
		i, comment, id, number;

	for ( i = 0; i < comments.length; i++ ) {
		comment = comments[ i ];

		if ( comment instanceof HeadingItem ) {
			// We don't need ids for section headings right now, but we might in the future
			// e.g. if we allow replying directly to sections (adding top-level comments)
			id = null;
		} else {
			// username+timestamp
			id = [
				comment.author || '',
				comment.timestamp.toISOString()
			].join( '|' );

			// If there would be multiple comments with the same ID (i.e. the user left multiple comments
			// in one edit, or within a minute), append sequential numbers
			number = 0;
			while ( commentsById[ id + '|' + number ] ) {
				number++;
			}
			id = id + '|' + number;
		}

		if ( id ) {
			commentsById[ id ] = comment;
		}

		// This modifies the original objects in `comments`!
		comment.id = id;

		if ( replies.length < comment.level ) {
			// Someone skipped an indentation level (or several). Pretend that the previous reply
			// covers multiple indentation levels, so that following comments get connected to it.
			comment.warnings = comment.warnings || [];
			comment.warnings.push( 'Comment skips indentation level' );
			while ( replies.length < comment.level ) {
				replies[ replies.length ] = replies[ replies.length - 1 ];
			}
		}

		if ( comment instanceof HeadingItem ) {
			// New root (thread)
			threads.push( comment );
		} else if ( replies[ comment.level - 1 ] ) {
			// Add as a reply to the closest less-nested comment
			comment.parent = replies[ comment.level - 1 ];
			comment.parent.replies.push( comment );
		} else {
			comment.warnings = comment.warnings || [];
			comment.warnings.push( 'Comment could not be connected to a thread' );
		}

		replies[ comment.level ] = comment;
		// Cut off more deeply nested replies
		replies.length = comment.level + 1;
	}

	return threads;
}

/**
 * Get the list of authors involved in a comment and its replies.
 *
 * @param {HeadingItem} heading Comment object, as returned by #groupThreads
 * @return {string[]} Author usernames
 */
function getAuthors( heading ) {
	var authors = {};
	function getAuthorSet( comment ) {
		authors[ comment.author ] = true;
		// Get the set of authors in the same format from each reply
		comment.replies.map( getAuthorSet );
	}

	heading.replies.map( getAuthorSet );

	return Object.keys( authors ).sort();
}

/**
 * Get the name of the page from which this comment is transcluded (if any).
 *
 * @param {CommentItem} comment Comment object, as returned by #groupThreads
 * @return {string|boolean} `false` if this comment is not transcluded. A string if it's transcluded
 *   from a single page (the page title, in text form with spaces). `true` if it's transcluded, but
 *   we can't determine the source.
 */
function getTranscludedFrom( comment ) {
	var node, dataMw;

	// If some template is used within the comment (e.g. {{ping|…}} or {{tl|…}}, or a
	// non-substituted signature template), that *does not* mean the comment is transcluded.
	// We only want to consider comments to be transcluded if the wrapper element (usually
	// <li> or <p>) is marked as part of a transclusion. If we can't find a wrapper, using
	// endContainer should avoid false negatives (although may have false positives).
	node = utils.getTranscludedFromElement(
		utils.getFullyCoveredWrapper( comment ) || comment.range.endContainer
	);

	if ( !node ) {
		// No mw:Transclusion node found, this comment is not transcluded
		return false;
	}

	dataMw = JSON.parse( node.getAttribute( 'data-mw' ) );

	// Only return a page name if this is a simple single-template transclusion.
	if (
		dataMw &&
		dataMw.parts &&
		dataMw.parts.length === 1 &&
		dataMw.parts[ 0 ].template &&
		dataMw.parts[ 0 ].template.target.href
	) {
		// Slice off the './' prefix and convert to text form (underscores to spaces, URL-decoded)
		return mw.libs.ve.normalizeParsoidResourceName( dataMw.parts[ 0 ].template.target.href );
	}

	// Multi-template transclusion, or a parser function call, or template-affected wikitext outside
	// of a template call, or a mix of the above
	return true;
}

module.exports = {
	findTimestamps: findTimestamps,
	getLocalTimestampParser: getLocalTimestampParser,
	getTimestampRegexp: getTimestampRegexp,
	getTimestampParser: getTimestampParser,
	getComments: getComments,
	groupThreads: groupThreads,
	findSignature: findSignature,
	getAuthors: getAuthors,
	getTranscludedFrom: getTranscludedFrom
};
