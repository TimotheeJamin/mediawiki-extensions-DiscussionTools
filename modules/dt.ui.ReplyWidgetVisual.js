var CommentTargetWidget = require( './dt-ve/CommentTargetWidget.js' );

require( './dt-ve/dt.ui.MWSignatureContextItem.js' );
require( './dt-ve/dt.dm.MWSignatureNode.js' );
require( './dt-ve/dt.ce.MWSignatureNode.js' );
require( './dt-ve/dt.ui.UsernameCompletionAction.js' );
require( './dt-ve/dt.ui.UsernameCompletionTool.js' );
require( './dt-ve/dt.dm.PingNode.js' );
require( './dt-ve/dt.ce.PingNode.js' );

/**
 * @external CommentController
 * @external CommentItem
 * @external CommentDetails
 */

/**
 * DiscussionTools ReplyWidgetVisual class
 *
 * @class mw.dt.ReplyWidgetVisual
 * @extends mw.dt.ReplyWidget
 * @constructor
 * @param {CommentController} commentController
 * @param {CommentItem} comment
 * @param {CommentDetails} commentDetails
 * @param {Object} [config]
 */
function ReplyWidgetVisual( commentController, comment, commentDetails, config ) {
	this.defaultMode = config.mode;

	// Parent constructor
	ReplyWidgetVisual.super.apply( this, arguments );

	// TODO: Rename this widget to VE, as it isn't just visual mode
	this.$element.addClass( 'ext-discussiontools-ui-replyWidget-ve' );
}

/* Inheritance */

OO.inheritClass( ReplyWidgetVisual, require( 'ext.discussionTools.ReplyWidget' ) );

/* Methods */

ReplyWidgetVisual.prototype.createReplyBodyWidget = function ( config ) {
	return new CommentTargetWidget( this, $.extend( {
		defaultMode: this.defaultMode
	}, config ) );
};

ReplyWidgetVisual.prototype.getValue = function () {
	if ( this.getMode() === 'source' ) {
		return this.replyBodyWidget.target.getSurface().getModel().getDom();
	} else {
		return this.replyBodyWidget.target.getSurface().getHtml();
	}
};

ReplyWidgetVisual.prototype.clear = function () {
	this.replyBodyWidget.clear();

	this.replyBodyWidget.target.clearDocState();

	// Parent method
	ReplyWidgetVisual.super.prototype.clear.apply( this, arguments );
};

ReplyWidgetVisual.prototype.isEmpty = function () {
	var surface = this.replyBodyWidget.target.getSurface();
	return !( surface && surface.getModel().getDocument().data.hasContent() );
};

ReplyWidgetVisual.prototype.getMode = function () {
	return this.replyBodyWidget.target.getSurface() ?
		this.replyBodyWidget.target.getSurface().getMode() :
		this.defaultMode;
};

ReplyWidgetVisual.prototype.setup = function ( data ) {
	var widget = this,
		target = this.replyBodyWidget.target;

	data = data || {};

	var htmlOrDoc;
	if ( this.storage.get( this.storagePrefix + '/saveable' ) ) {
		htmlOrDoc = this.storage.get( this.storagePrefix + '/ve-dochtml' );
		target.recovered = true;
	} else {
		htmlOrDoc = data.value || ( this.getMode() === 'visual' ? '<p></p>' : '' );
	}

	target.originalHtml = htmlOrDoc instanceof HTMLDocument ? ve.properInnerHtml( htmlOrDoc.body ) : htmlOrDoc;
	target.fromEditedState = !!data.value;

	this.replyBodyWidget.setDocument( htmlOrDoc );

	target.once( 'surfaceReady', function () {
		target.getSurface().getView().connect( widget, {
			focus: [ 'emit', 'bodyFocus' ]
		} );

		target.getSurface().getModel().setAutosaveDocId( widget.storagePrefix );
		target.initAutosave();
		widget.afterSetup();

		// This needs to bind after surfaceReady so any initial population doesn't trigger it early:
		widget.replyBodyWidget.once( 'change', widget.onFirstTransaction.bind( widget ) );
	} );

	// Parent method
	ReplyWidgetVisual.super.prototype.setup.apply( this, arguments );

	// Events
	this.replyBodyWidget.connect( this, {
		change: 'onInputChangeThrottled',
		submit: 'onReplyClick'
	} );

	return this;
};

ReplyWidgetVisual.prototype.teardown = function () {
	this.replyBodyWidget.disconnect( this );
	this.replyBodyWidget.off( 'change' );

	// Parent method
	return ReplyWidgetVisual.super.prototype.teardown.call( this );
};

ReplyWidgetVisual.prototype.focus = function () {
	var targetWidget = this.replyBodyWidget;
	setTimeout( function () {
		// Check surface still exists after timeout
		if ( targetWidget.getSurface() ) {
			targetWidget.getSurface().getModel().selectLastContentOffset();
			targetWidget.focus();
		}
	} );

	return this;
};

ve.trackSubscribe( 'activity.', function ( topic, data ) {
	mw.track( 'dt.schemaVisualEditorFeatureUse', ve.extendObject( data, {
		feature: topic.split( '.' )[ 1 ]
	} ) );
} );

module.exports = ReplyWidgetVisual;
