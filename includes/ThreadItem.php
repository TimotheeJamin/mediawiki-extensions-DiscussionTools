<?php

namespace MediaWiki\Extension\DiscussionTools;

/**
 * A thread item, either a heading or a comment
 */
abstract class ThreadItem {
	private $type;
	private $range;
	private $level;

	private $id = null;
	private $replies = [];

	/**
	 * @param string $type `heading` or `comment`
	 * @param int $level Item level in the thread tree
	 * @param ImmutableRange $range Object describing the extent of the comment, including the
	 *  signature and timestamp.
	 */
	public function __construct(
		string $type, int $level, ImmutableRange $range
	) {
		$this->type = $type;
		$this->level = $level;
		$this->range = $range;
	}

	/**
	 * @return string Thread item type
	 */
	public function getType() : string {
		return $this->type;
	}

	/**
	 * @return int Thread item level
	 */
	public function getLevel() : int {
		return $this->level;
	}

	/**
	 * @return ImmutableRange Thread item range
	 */
	public function getRange() : ImmutableRange {
		return $this->range;
	}

	/**
	 * @return string|null Thread ID
	 */
	public function getId() : ?string {
		return $this->id;
	}

	/**
	 * @return CommentItem[] Replies to this thread item
	 */
	public function getReplies() : array {
		return $this->replies;
	}

	/**
	 * @param int $level Thread item level
	 */
	public function setLevel( int $level ) : void {
		$this->level = $level;
	}

	/**
	 * @param ImmutableRange $range Thread item range
	 */
	public function setRange( ImmutableRange $range ) : void {
		$this->range = $range;
	}

	/**
	 * @param string|null $id Thread ID
	 */
	public function setId( ?string $id ) : void {
		$this->id = $id;
	}

	/**
	 * @param CommentItem $reply Reply comment
	 */
	public function addReply( CommentItem $reply ) : void {
		$this->replies[] = $reply;
	}
}
