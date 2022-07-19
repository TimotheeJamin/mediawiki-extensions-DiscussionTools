<?php

namespace MediaWiki\Extension\DiscussionTools\ThreadItem;

class DatabaseHeadingItem extends DatabaseThreadItem implements HeadingItem {
	use HeadingItemTrait;

	/** @var bool */
	private $placeholderHeading;
	/** @var int */
	private $headingLevel;

	// Placeholder headings must have a level higher than real headings (1-6)
	private const PLACEHOLDER_HEADING_LEVEL = 99;

	/**
	 * @param string $name
	 * @param string $id
	 * @param DatabaseThreadItem|null $parent
	 * @param bool|string $transcludedFrom
	 * @param int $level
	 * @param ?int $headingLevel Heading level (1-6). Use null for a placeholder heading.
	 */
	public function __construct(
		string $name, string $id, ?DatabaseThreadItem $parent, $transcludedFrom, int $level,
		?int $headingLevel
	) {
		parent::__construct( 'heading', $name, $id, $parent, $transcludedFrom, $level );
		$this->placeholderHeading = $headingLevel === null;
		$this->headingLevel = $this->placeholderHeading ? static::PLACEHOLDER_HEADING_LEVEL : $headingLevel;
	}

	/**
	 * @inheritDoc
	 */
	public function getHeadingLevel(): int {
		return $this->headingLevel;
	}

	/**
	 * @inheritDoc
	 */
	public function isPlaceholderHeading(): bool {
		return $this->placeholderHeading;
	}
}
