var registries = require( './dt.ui.registries.js' );

/**
 * DiscussionTools-specific target, inheriting from the stand-alone target
 *
 * @class
 * @extends ve.init.mw.Target
 *
 * @param {mw.dt.ReplyWidgetVisual} replyWidget
 * @param {Object} config Configuration options
 */
function CommentTarget( replyWidget, config ) {
	config = config || {};

	this.replyWidget = replyWidget;

	// Parent constructor
	CommentTarget.super.call( this, ve.extendObject( {
		toolbarConfig: { actions: true, $overlay: true, position: 'top' }
	}, config ) );
}

/* Inheritance */

OO.inheritClass( CommentTarget, ve.init.mw.Target );

/* Static methods */

CommentTarget.static.name = 'discussionTools';

CommentTarget.static.modes = [ 'visual', 'source' ];

CommentTarget.static.toolbarGroups = [
	{
		name: 'style',
		title: OO.ui.deferMsg( 'visualeditor-toolbar-style-tooltip' ),
		include: [ 'bold', 'italic', 'moreTextStyle' ]
	},
	{
		name: 'link',
		include: [ 'link' ]
	},
	{
		name: 'other',
		include: [ 'usernameCompletion' ]
	}
];

CommentTarget.static.importRules = ve.copy( CommentTarget.static.importRules );

CommentTarget.static.importRules.external.conversions = ve.extendObject(
	{},
	CommentTarget.static.importRules.external.conversions,
	{
		mwHeading: 'paragraph'
	}
);

CommentTarget.static.importRules.external.blacklist = ve.extendObject(
	{},
	CommentTarget.static.importRules.external.blacklist,
	{
		// Annotations
		// Allow pasting external links
		'link/mwExternal': false,
		// Strip all table structure
		mwTable: true,
		tableSection: true,
		tableRow: true,
		tableCell: true
	}
);

// T280745
CommentTarget.static.convertToWikitextOnPaste = false;

CommentTarget.prototype.attachToolbar = function () {
	this.replyWidget.$headerWrapper.append(
		this.getToolbar().$element.append( this.replyWidget.modeTabSelect.$element )
	);
	this.getToolbar().$element.prepend( this.getSurface().getToolbarDialogs().$element );
};

CommentTarget.prototype.getSurfaceConfig = function ( config ) {
	config = ve.extendObject( { mode: this.defaultMode }, config );
	return CommentTarget.super.prototype.getSurfaceConfig.call( this, ve.extendObject( {
		commandRegistry: config.mode === 'source' ? registries.wikitextCommandRegistry : registries.commandRegistry,
		sequenceRegistry: config.mode === 'source' ? registries.wikitextSequenceRegistry : registries.sequenceRegistry,
		dataTransferHandlerFactory: config.mode === 'source' ? ve.ui.wikitextDataTransferHandlerFactory : ve.ui.dataTransferHandlerFactory,
		// eslint-disable-next-line no-jquery/no-global-selector
		$overlayContainer: $( '#content' )
	}, config ) );
};

/* Registration */

ve.init.mw.targetFactory.register( CommentTarget );

module.exports = CommentTarget;
